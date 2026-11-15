use std::fs;

pub fn read_os_file(path: &str) -> Result<String, std::io::Error> {
    fs::read_to_string(path)
}

pub fn write_os_file(path: &str, content: &str) -> Result<(), std::io::Error> {
    fs::write(path, content)
}
