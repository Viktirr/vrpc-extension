# Due to differences between Firefox and Chromium browsers (Chromium's enforcing of manifest V3 and other incompatibility between each other), I had to make this build script.
# This build script assumes everything is in the same folder, this is not designed for anything but this use case so be careful when using this script.

# Used Deepseek R1 while creating this script (the difference is clear where my code and the Deepseek's is). Exceeded my expectations.

import sys
import os
import shutil

platform = "any"
if (1 in sys.argv):
    if (sys.argv[1] == "firefox"):
        platform = "firefox"
    elif (sys.argv[1] == "chrome"):
        platform = "chrome"
    

CurrentDirectory = os.getcwd()
MainPath = "../"

def copy_to_parent_folder(root_folder=None, platform=None):
    # Set default root to current working directory
    if root_folder is None:
        root_folder = os.getcwd()
    root_folder = os.path.abspath(root_folder)
    
    # Collect all files and folders (excluding .git)
    all_items = []
    for root_dir, dirs, files in os.walk(root_folder):
        # Remove .git directories from traversal
        dirs[:] = [d for d in dirs if d != '.git']
        
        relative_path = os.path.relpath(root_dir, root_folder)
        
        # Add directories (excluding .git)
        for dir_name in dirs:
            dir_rel = os.path.join(relative_path, dir_name)
            all_items.append(dir_rel)
        
        # Add files
        for file_name in files:
            if (file_name == "manifest.json" or file_name == "build.py" or file_name == "README.md"):
                continue
            if (platform == "chrome" and file_name == "manifest-firefox.json"):
                continue
            if (platform == "firefox" and file_name == "manifest-chrome.json"):
                continue
            file_rel = os.path.join(relative_path, file_name)
            all_items.append(file_rel)
    
    # Get parent folder of the root directory
    parent_folder = os.path.dirname(root_folder)
    if (platform == "firefox"):
        parent_folder = os.path.join(parent_folder, "vrpc-extension-firefox")
    if (platform == "chrome"):
        parent_folder = os.path.join(parent_folder, "vrpc-extension-chrome")
    
    # Copy items to parent folder
    for rel_item in all_items:
        src_path = os.path.join(root_folder, rel_item)

        if ("manifest-firefox.json" in rel_item or "manifest-chrome.json" in rel_item):
            rel_item = ".\\manifest.json"

        dest_path = os.path.join(parent_folder, rel_item)
        
        if os.path.isdir(src_path):
            os.makedirs(dest_path, exist_ok=True)
        else:
            os.makedirs(os.path.dirname(dest_path), exist_ok=True)
            shutil.copy2(src_path, dest_path)
    
    print(f"Copied {len(all_items)} items to {parent_folder}")

if (platform == "firefox"):
    copy_to_parent_folder(".", "firefox")
elif (platform == "chrome"):
    copy_to_parent_folder(".", "chrome")
else:
    copy_to_parent_folder(".", "firefox")
    copy_to_parent_folder(".", "chrome")

    