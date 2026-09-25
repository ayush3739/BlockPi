import os
import json
import winreg
import tkinter as tk
from tkinter import filedialog
from tkinter import simpledialog

COMMON_PATHS = [
    r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe",
    r"C:\Program Files (x86)\BraveSoftware\Brave-Browser\Application\brave.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\BraveSoftware\Brave-Browser\Application\brave.exe")
]

def find_brave():
    for path in COMMON_PATHS:
        if os.path.exists(path):
            return path
    
    root = tk.Tk()
    root.withdraw()
    path = filedialog.askopenfilename(
        title="Select brave.exe",
        filetypes=[("Executable", "*.exe")]
    )
    return path

def install():
    print("Installing YouTube Brave PWA Native Messaging Host...")
    
    brave_path = find_brave()
    if not brave_path:
        print("Brave executable not found. Exiting.")
        return
        
    print(f"Found Brave at: {brave_path}")
    
    root = tk.Tk()
    root.withdraw()
    ext_id = simpledialog.askstring("Extension ID", "Enter the Chrome Extension ID for BlockPi:\n(You can find this on the chrome://extensions page)")
    if not ext_id:
        print("Extension ID is required. Exiting.")
        return
        
    ext_id = ext_id.strip()
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    host_py_path = os.path.join(script_dir, "host.py")
    host_bat_path = os.path.join(script_dir, "host.bat")
    host_json_path = os.path.join(script_dir, "host.json")
    
    # Create host.bat wrapper
    with open(host_bat_path, "w", encoding="utf-8") as f:
        f.write(f'@echo off\r\npython "{host_py_path}" %*')
        
    # Create host.json
    manifest = {
        "name": "com.ayush.youtube",
        "description": "YouTube launcher for Brave PWA",
        "path": host_bat_path,
        "type": "stdio",
        "allowed_origins": [
            f"chrome-extension://{ext_id}/"
        ],
        "brave_path": brave_path
    }
    
    with open(host_json_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=4)
        
    # Write to registry
    try:
        key_path = r"Software\Google\Chrome\NativeMessagingHosts\com.ayush.youtube"
        key = winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path)
        winreg.SetValueEx(key, "", 0, winreg.REG_SZ, host_json_path)
        winreg.CloseKey(key)
        print("Successfully installed registry key!")
    except Exception as e:
        print(f"Failed to install registry key: {e}")
        return
        
    print("Installation complete!")

if __name__ == "__main__":
    install()
