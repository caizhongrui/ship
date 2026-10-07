use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{ErrorKind, Read, Write};
use std::net::{IpAddr, SocketAddr, TcpStream};
use std::sync::atomic::{AtomicU16, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::Manager;

const CONFIG_FILE: &str = "sensor-device.json";
static TRANSACTION_ID: AtomicU16 = AtomicU16::new(1);

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum Transport {
    ModbusTcp,
    RtuOverTcp,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum SensorType {
    SingleAxis,
    ThreeAxis,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DeviceConfig {
    pub ip: String,
    pub port: u16,
    pub transport: Transport,
    pub sensor_type: SensorType,
    pub unit_id: u8,
    pub function_code: u8,
    pub timeout_ms: u64,
    pub poll_interval_ms: u64,
    pub baud_rate: Option<u32>,
}

impl Default for DeviceConfig {
    fn default() -> Self {
        Self {
            ip: "192.168.0.177".into(),
            port: 20108,
            transport: Transport::ModbusTcp,
            sensor_type: SensorType::SingleAxis,
            unit_id: 1,
            function_code: 3,
            timeout_ms: 2000,
            poll_interval_ms: 1000,
            baud_rate: Some(4800),
        }
    }
}

impl DeviceConfig {
    fn validate(&self) -> Result<SocketAddr, String> {
        let ip: IpAddr = self
            .ip
            .trim()
            .parse()
            .map_err(|_| "请输入有效的 IPv4 或 IPv6 地址")?;
        if ip.is_unspecified() || ip.is_multicast() || ip == IpAddr::from([255, 255, 255, 255]) {
            return Err("请填写具体设备 IP，不能使用未指定、组播或广播地址".into());
        }
        if self.port == 0 {
            return Err("端口范围为 1–65535".into());
        }
        if !(1..=254).contains(&self.unit_id) {
            return Err("传感器地址范围为 1–254，出厂默认地址为 1".into());
        }
        if ![3, 4].contains(&self.function_code) {
            return Err("此传感器只支持使用 03 或 04 功能码读取测量值".into());
        }
        if !(500..=10000).contains(&self.timeout_ms) {
            return Err("超时时间范围为 500–10000 毫秒".into());
        }
        if !(1000..=60000).contains(&self.poll_interval_ms) {
            return Err("自动读取间隔范围为 1000–60000 毫秒".into());
        }
        if let Some(baud) = self.baud_rate {
            if ![1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].contains(&baud) {
                return Err("波特率不在传感器协议支持的范围内".into());
            }
        }
        Ok(SocketAddr::new(ip, self.port))
    }
}

#[tauri::command]
pub fn load_device_config(app: tauri::AppHandle) -> Result<DeviceConfig, String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法定位配置目录：{e}"))?
        .join(CONFIG_FILE);
    match fs::read_to_string(path) {
        Ok(text) => serde_json::from_str(&text).map_err(|e| format!("设备配置文件格式错误：{e}")),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(DeviceConfig::default()),
        Err(e) => Err(format!("读取设备配置失败：{e}")),
    }
}

#[tauri::command]
pub fn save_device_config(app: tauri::AppHandle, mut config: DeviceConfig) -> Result<(), String> {
    config.ip = config.ip.trim().to_string();
    config.validate()?;
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法定位配置目录：{e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建配置目录：{e}"))?;
    let text = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(dir.join(CONFIG_FILE), text).map_err(|e| format!("保存设备配置失败：{e}"))
}

#[derive(Clone, Copy, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum TestAction {
    Connection,
    Read,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Measurement {
    key: String,
    label: String,
    value: f64,
    unit: String,
    displacement_mm: Option<f64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterValue {
    address: u16,
    raw: u16,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameTrace {
    start_address: u16,
    count: u16,
    request: String,
    response: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestReport {
    ok: bool,
    action: TestAction,
    endpoint: String,
    transport: Transport,
    sensor_type: SensorType,
    elapsed_ms: u64,
    sampled_at: u64,
    message: String,
    error_stage: Option<String>,
    measurements: Vec<Measurement>,
    registers: Vec<RegisterValue>,
    frames: Vec<FrameTrace>,
}

struct DeviceError {
    stage: &'static str,
    message: String,
}

impl DeviceError {
    fn new(stage: &'static str, message: impl Into<String>) -> Self {
        Self {
            stage,
            message: message.into(),
        }
    }
}

#[tauri::command]
pub async fn test_sensor_device(
    config: DeviceConfig,
    action: TestAction,
) -> Result<TestReport, String> {
    config.validate()?;
    tauri::async_runtime::spawn_blocking(move || execute_test(&config, action))
        .await
        .map_err(|e| format!("设备测试任务失败：{e}"))?
}

fn execute_test(config: &DeviceConfig, action: TestAction) -> Result<TestReport, String> {
    let endpoint = config.validate()?;
    let started = Instant::now();
    let mut report = TestReport {
        ok: false,
        action,
        endpoint: endpoint.to_string(),
        transport: config.transport,
        sensor_type: config.sensor_type,
        elapsed_ms: 0,
        sampled_at: 0,
        message: String::new(),
        error_stage: None,
        measurements: Vec::new(),
        registers: Vec::new(),
        frames: Vec::new(),
    };
    let result = (|| {
        let timeout = Duration::from_millis(config.timeout_ms);
        let mut stream = TcpStream::connect_timeout(&endpoint, timeout).map_err(|e| {
            DeviceError::new(
                "连接网关",
                format!("网口连接失败：{e}。请检查 IP、端口、网线和网关 TCP 服务。"),
            )
        })?;
        stream
            .set_write_timeout(Some(timeout))
            .map_err(|e| DeviceError::new("设置超时", e.to_string()))?;
        if action == TestAction::Connection {
            return Ok(());
        }
        // 三轴设备的 0x0007/0x0008 未在手册中定义，分两段读取以避开保留地址。
        let blocks: &[(u16, u16)] = match config.sensor_type {
            SensorType::SingleAxis => &[(0, 4)],
            SensorType::ThreeAxis => &[(0, 7), (9, 4)],
        };
        for &(start, count) in blocks {
            let registers = exchange(&mut stream, config, start, count, &mut report.frames)?;
            report
                .registers
                .extend(
                    registers
                        .into_iter()
                        .enumerate()
                        .map(|(i, raw)| RegisterValue {
                            address: start + i as u16,
                            raw,
                        }),
                );
        }
        report.measurements = decode_measurements(config.sensor_type, &report.registers);
        Ok::<(), DeviceError>(())
    })();
    match result {
        Ok(()) => {
            report.ok = true;
            report.message = match action {
                TestAction::Connection => {
                    "网口连接成功。继续读取传感器可验证 485 通信和寄存器数据。".into()
                }
                TestAction::Read => "传感器读取成功，响应及数据格式校验通过。".into(),
            };
        }
        Err(e) => {
            report.error_stage = Some(e.stage.into());
            report.message = e.message;
        }
    }
    report.elapsed_ms = started.elapsed().as_millis() as u64;
    report.sampled_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    Ok(report)
}

fn crc16(bytes: &[u8]) -> u16 {
    let mut crc = 0xffffu16;
    for &byte in bytes {
        crc ^= byte as u16;
        for _ in 0..8 {
            crc = if crc & 1 != 0 {
                (crc >> 1) ^ 0xa001
            } else {
                crc >> 1
            };
        }
    }
    crc
}

fn hex(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|b| format!("{b:02X}"))
        .collect::<Vec<_>>()
        .join(" ")
}

fn build_request(config: &DeviceConfig, start: u16, count: u16, transaction: u16) -> Vec<u8> {
    let mut body = vec![config.unit_id, config.function_code];
    body.extend_from_slice(&start.to_be_bytes());
    body.extend_from_slice(&count.to_be_bytes());
    match config.transport {
        Transport::RtuOverTcp => {
            body.extend_from_slice(&crc16(&body).to_le_bytes());
            body
        }
        Transport::ModbusTcp => {
            let mut request = transaction.to_be_bytes().to_vec();
            request.extend_from_slice(&[0, 0, 0, 6]);
            request.extend_from_slice(&body);
            request
        }
    }
}

fn receive(
    stream: &mut TcpStream,
    response: &mut Vec<u8>,
    length: usize,
    deadline: Instant,
) -> Result<(), DeviceError> {
    let target = response.len() + length;
    while response.len() < target {
        let remaining = deadline
            .checked_duration_since(Instant::now())
            .filter(|d| !d.is_zero())
            .ok_or_else(|| {
                DeviceError::new(
                    "接收响应",
                    "读取超时，请核对网关模式、传感器地址、波特率和 485 接线。",
                )
            })?;
        stream
            .set_read_timeout(Some(remaining))
            .map_err(|e| DeviceError::new("设置超时", e.to_string()))?;
        let mut buffer = [0u8; 256];
        let needed = (target - response.len()).min(buffer.len());
        match stream.read(&mut buffer[..needed]) {
            Ok(0) => {
                return Err(DeviceError::new(
                    "接收响应",
                    "网关关闭了连接，未收到完整传感器响应。",
                ))
            }
            Ok(n) => response.extend_from_slice(&buffer[..n]),
            Err(e) if e.kind() == ErrorKind::Interrupted => continue,
            Err(e) if matches!(e.kind(), ErrorKind::TimedOut | ErrorKind::WouldBlock) => {
                return Err(DeviceError::new(
                    "接收响应",
                    "读取超时，请核对网关模式、传感器地址、波特率和 485 接线。",
                ));
            }
            Err(e) => return Err(DeviceError::new("接收响应", format!("接收失败：{e}"))),
        }
    }
    Ok(())
}

fn exchange(
    stream: &mut TcpStream,
    config: &DeviceConfig,
    start: u16,
    count: u16,
    frames: &mut Vec<FrameTrace>,
) -> Result<Vec<u16>, DeviceError> {
    let transaction = TRANSACTION_ID.fetch_add(1, Ordering::Relaxed);
    let request = build_request(config, start, count, transaction);
    let mut response = Vec::new();
    let result = (|| {
        stream
            .write_all(&request)
            .map_err(|e| DeviceError::new("发送请求", format!("请求发送失败：{e}")))?;
        let deadline = Instant::now() + Duration::from_millis(config.timeout_ms);
        match config.transport {
            Transport::ModbusTcp => {
                receive(stream, &mut response, 7, deadline)?;
                if u16::from_be_bytes([response[0], response[1]]) != transaction
                    || response[2..4] != [0, 0]
                {
                    return Err(DeviceError::new(
                        "协议校验",
                        "Modbus TCP 事务号或协议标识不正确，请检查网关是否工作在协议转换模式。",
                    ));
                }
                if response[6] != config.unit_id {
                    return Err(DeviceError::new("协议校验", "响应从站地址与配置不一致。"));
                }
                let length = u16::from_be_bytes([response[4], response[5]]) as usize;
                if !(3..=254).contains(&length) {
                    return Err(DeviceError::new("协议校验", "Modbus TCP 响应长度不合法。"));
                }
                receive(stream, &mut response, length - 1, deadline)?;
                parse_pdu(&response[7..], config.function_code, count)
            }
            Transport::RtuOverTcp => {
                receive(stream, &mut response, 3, deadline)?;
                if response[0] != config.unit_id {
                    return Err(DeviceError::new("协议校验", "响应从站地址与配置不一致。"));
                }
                let is_exception = response[1] == (config.function_code | 0x80);
                if !is_exception
                    && (response[1] != config.function_code || response[2] as u16 != count * 2)
                {
                    return Err(DeviceError::new(
                        "协议校验",
                        "RTU 功能码或数据长度不匹配，请检查网关是否工作在透明传输模式。",
                    ));
                }
                let remainder = if is_exception {
                    2
                } else {
                    response[2] as usize + 2
                };
                receive(stream, &mut response, remainder, deadline)?;
                let crc_offset = response.len() - 2;
                let received_crc =
                    u16::from_le_bytes([response[crc_offset], response[crc_offset + 1]]);
                if crc16(&response[..crc_offset]) != received_crc {
                    return Err(DeviceError::new(
                        "协议校验",
                        "RTU CRC 校验失败，请检查 485 接线及网关数据打包设置。",
                    ));
                }
                parse_pdu(&response[1..crc_offset], config.function_code, count)
            }
        }
    })();
    frames.push(FrameTrace {
        start_address: start,
        count,
        request: hex(&request),
        response: hex(&response),
    });
    result
}

fn parse_pdu(pdu: &[u8], function: u8, count: u16) -> Result<Vec<u16>, DeviceError> {
    if pdu.len() < 2 {
        return Err(DeviceError::new("协议校验", "响应数据不完整。"));
    }
    if pdu[0] == (function | 0x80) {
        if pdu.len() != 2 {
            return Err(DeviceError::new("协议校验", "异常响应长度不正确。"));
        }
        let explanation = match pdu[1] {
            1 => "设备不支持此功能码，可尝试切换 03 / 04",
            2 => "寄存器地址不支持，请核对单轴 / 三轴型号",
            3 => "请求参数不合法",
            4 => "设备内部故障",
            6 => "设备忙，请稍后重试",
            10 => "网关路径不可用",
            11 => "网关未收到传感器响应，请检查从站地址、波特率及接线",
            _ => "设备返回异常",
        };
        return Err(DeviceError::new(
            "传感器响应",
            format!("Modbus 异常 0x{:02X}：{explanation}。", pdu[1]),
        ));
    }
    if pdu[0] != function || pdu[1] as u16 != count * 2 || pdu.len() != 2 + count as usize * 2 {
        return Err(DeviceError::new(
            "协议校验",
            "响应功能码、字节数或寄存器数量与请求不一致。",
        ));
    }
    Ok(pdu[2..]
        .chunks_exact(2)
        .map(|v| u16::from_be_bytes([v[0], v[1]]))
        .collect())
}

fn decode_measurements(sensor_type: SensorType, registers: &[RegisterValue]) -> Vec<Measurement> {
    let definitions: Vec<(u16, &str, &str, &str, bool)> = match sensor_type {
        SensorType::SingleAxis => vec![
            (0, "temperature", "表面温度", "℃", true),
            (1, "velocity", "振动速度", "mm/s", false),
            (2, "displacement", "振动位移", "μm", false),
            (3, "acceleration", "振动加速度", "m/s²", true),
        ],
        SensorType::ThreeAxis => vec![
            (0, "temperature", "表面温度", "℃", true),
            (1, "velocity-x", "X 轴速度", "mm/s", false),
            (2, "velocity-y", "Y 轴速度", "mm/s", false),
            (3, "velocity-z", "Z 轴速度", "mm/s", false),
            (4, "displacement-x", "X 轴位移", "μm", false),
            (5, "displacement-y", "Y 轴位移", "μm", false),
            (6, "displacement-z", "Z 轴位移", "μm", false),
            (10, "acceleration-x", "X 轴加速度", "m/s²", true),
            (11, "acceleration-y", "Y 轴加速度", "m/s²", true),
            (12, "acceleration-z", "Z 轴加速度", "m/s²", true),
        ],
    };
    definitions
        .into_iter()
        .filter_map(|(address, key, label, unit, signed)| {
            let raw = registers.iter().find(|r| r.address == address)?.raw;
            let value = if signed {
                raw as i16 as f64
            } else {
                raw as f64
            } / 10.0;
            Some(Measurement {
                key: key.into(),
                label: label.into(),
                value,
                unit: unit.into(),
                displacement_mm: if unit == "μm" {
                    Some(value / 1000.0)
                } else {
                    None
                },
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;
    use std::thread;

    #[test]
    fn default_configuration_matches_gateway() {
        let config = DeviceConfig::default();
        config.validate().unwrap();
        assert_eq!(
            serde_json::to_value(config).unwrap(),
            serde_json::json!({
                "ip": "192.168.0.177", "port": 20108, "transport": "modbus-tcp",
                "sensorType": "single-axis", "unitId": 1, "functionCode": 3,
                "timeoutMs": 2000, "pollIntervalMs": 1000, "baudRate": 4800
            })
        );
    }

    #[test]
    fn documented_request_and_response() {
        let config = DeviceConfig {
            ip: "127.0.0.1".into(),
            transport: Transport::RtuOverTcp,
            ..DeviceConfig::default()
        };
        assert_eq!(
            build_request(&config, 0, 1, 1),
            [1, 3, 0, 0, 0, 1, 0x84, 0x0a]
        );
        assert_eq!(crc16(&[1, 3, 2, 0, 0x50]), 0x78b8);
        let registers = vec![RegisterValue {
            address: 0,
            raw: 0x50,
        }];
        assert_eq!(
            decode_measurements(SensorType::SingleAxis, &registers)[0].value,
            8.0
        );
    }

    #[test]
    fn signed_values_and_displacement_units() {
        let registers = vec![
            RegisterValue {
                address: 0,
                raw: (-125i16) as u16,
            },
            RegisterValue {
                address: 2,
                raw: 2100,
            },
        ];
        let values = decode_measurements(SensorType::SingleAxis, &registers);
        assert_eq!(values[0].value, -12.5);
        assert_eq!(values[1].value, 210.0);
        assert_eq!(values[1].displacement_mm, Some(0.21));
    }

    #[test]
    fn rejects_bad_responses_and_configuration() {
        assert!(parse_pdu(&[3, 2, 0, 80], 3, 4).is_err());
        assert!(parse_pdu(&[0x83, 2], 3, 4).is_err());
        assert!(DeviceConfig {
            ip: String::new(),
            ..DeviceConfig::default()
        }
        .validate()
        .is_err());
        assert!(DeviceConfig {
            ip: "127.0.0.1".into(),
            unit_id: 0,
            ..DeviceConfig::default()
        }
        .validate()
        .is_err());
    }

    #[test]
    fn configuration_json_matches_frontend_and_round_trips() {
        let config = DeviceConfig {
            ip: "192.168.1.100".into(),
            transport: Transport::RtuOverTcp,
            sensor_type: SensorType::ThreeAxis,
            baud_rate: Some(9600),
            ..DeviceConfig::default()
        };
        let serialized = serde_json::to_value(&config).unwrap();
        assert_eq!(serialized["sensorType"], "three-axis");
        assert_eq!(serialized["transport"], "rtu-over-tcp");
        assert_eq!(serialized["unitId"], 1);
        assert_eq!(serialized["baudRate"], 9600);
        let restored: DeviceConfig = serde_json::from_value(serialized.clone()).unwrap();
        restored.validate().unwrap();
        assert_eq!(serde_json::to_value(restored).unwrap(), serialized);
        let defaults: DeviceConfig = serde_json::from_str(r#"{"ip":"192.168.1.100"}"#).unwrap();
        assert_eq!(defaults.port, 20108);
        assert_eq!(defaults.function_code, 3);
        assert_eq!(defaults.transport, Transport::ModbusTcp);
        assert_eq!(defaults.baud_rate, Some(4800));
    }

    #[test]
    fn tcp_three_axis_reads_skip_reserved_registers_and_handle_fragments() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            for (start, values) in [
                (0u16, vec![250u16, 10, 20, 30, 100, 200, 300]),
                (9, vec![42, 10, 20, 30]),
            ] {
                let mut request = [0; 12];
                socket.read_exact(&mut request).unwrap();
                assert_eq!(u16::from_be_bytes([request[8], request[9]]), start);
                assert_eq!(
                    u16::from_be_bytes([request[10], request[11]]),
                    values.len() as u16
                );
                let mut response = request[..2].to_vec();
                response.extend_from_slice(&[
                    0,
                    0,
                    0,
                    (3 + values.len() * 2) as u8,
                    1,
                    3,
                    (values.len() * 2) as u8,
                ]);
                for value in values {
                    response.extend_from_slice(&value.to_be_bytes());
                }
                for part in response.chunks(2) {
                    socket.write_all(part).unwrap();
                    thread::sleep(Duration::from_millis(1));
                }
            }
        });
        let config = DeviceConfig {
            ip: "127.0.0.1".into(),
            port,
            sensor_type: SensorType::ThreeAxis,
            transport: Transport::ModbusTcp,
            ..DeviceConfig::default()
        };
        let result = execute_test(&config, TestAction::Read).unwrap();
        server.join().unwrap();
        assert!(result.ok, "{}", result.message);
        assert_eq!(result.frames.len(), 2);
        assert_eq!(result.measurements.len(), 10);
        assert_eq!(result.measurements[0].value, 25.0);
        assert_eq!(
            result
                .registers
                .iter()
                .find(|r| r.address == 9)
                .unwrap()
                .raw,
            42
        );
    }

    #[test]
    fn rtu_bad_crc_is_reported_with_raw_frame() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let mut request = [0; 8];
            socket.read_exact(&mut request).unwrap();
            socket
                .write_all(&[1, 3, 8, 0, 250, 0, 10, 0, 20, 0, 30, 0, 0])
                .unwrap();
        });
        let config = DeviceConfig {
            ip: "127.0.0.1".into(),
            port,
            transport: Transport::RtuOverTcp,
            ..DeviceConfig::default()
        };
        let result = execute_test(&config, TestAction::Read).unwrap();
        server.join().unwrap();
        assert!(!result.ok);
        assert!(result.message.contains("CRC"));
        assert_eq!(result.frames.len(), 1);
        assert!(!result.frames[0].response.is_empty());
    }

    #[test]
    fn rtu_function_04_reads_single_axis_with_fragmented_response() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            let mut request = [0; 8];
            socket.read_exact(&mut request).unwrap();
            assert_eq!(&request[..6], &[12, 4, 0, 0, 0, 4]);
            assert_eq!(
                u16::from_le_bytes([request[6], request[7]]),
                crc16(&request[..6])
            );
            let mut response = vec![12, 4, 8];
            for value in [582u16, 15, 2100, 25] {
                response.extend_from_slice(&value.to_be_bytes());
            }
            response.extend_from_slice(&crc16(&response).to_le_bytes());
            for byte in response {
                socket.write_all(&[byte]).unwrap();
                thread::sleep(Duration::from_millis(1));
            }
        });
        let config = DeviceConfig {
            ip: "127.0.0.1".into(),
            port,
            transport: Transport::RtuOverTcp,
            unit_id: 12,
            function_code: 4,
            ..DeviceConfig::default()
        };
        let result = execute_test(&config, TestAction::Read).unwrap();
        server.join().unwrap();
        assert!(result.ok, "{}", result.message);
        assert_eq!(result.measurements.len(), 4);
        assert_eq!(result.measurements[0].value, 58.2);
        assert_eq!(result.measurements[2].displacement_mm, Some(0.21));
    }

    #[test]
    fn read_timeout_keeps_partial_frame_and_reports_failure() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            let mut request = [0; 12];
            socket.read_exact(&mut request).unwrap();
            // A valid prefix without the rest of the MBAP header must time out.
            socket.write_all(&request[..2]).unwrap();
            thread::sleep(Duration::from_millis(700));
        });
        let config = DeviceConfig {
            ip: "127.0.0.1".into(),
            port,
            timeout_ms: 500,
            transport: Transport::ModbusTcp,
            ..DeviceConfig::default()
        };
        let result = execute_test(&config, TestAction::Read).unwrap();
        server.join().unwrap();
        assert!(!result.ok);
        assert!(result.message.contains("超时"), "{}", result.message);
        assert_eq!(result.frames[0].response.split_whitespace().count(), 2);
        assert!(result.measurements.is_empty());
    }
}
