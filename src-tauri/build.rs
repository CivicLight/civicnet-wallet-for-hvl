use std::fs;

fn main() {
    // Embed the Pinata JWT at compile time from a gitignored local file, so
    // it never lands in source control. Missing file -> empty string, read
    // at runtime via option_env!/env! with a graceful "not configured" path.
    let secret_path = "pinata_jwt.secret";
    let jwt = fs::read_to_string(secret_path).unwrap_or_default();
    println!("cargo:rustc-env=PINATA_JWT={}", jwt.trim());
    println!("cargo:rerun-if-changed={}", secret_path);

    tauri_build::build();
}
