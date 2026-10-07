mod device;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(device::SensorClient::default())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            device::load_device_config,
            device::save_device_config,
            device::test_sensor_device,
            device::close_sensor_connection
        ])
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
