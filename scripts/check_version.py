import json
import sys
import os

def check_versions():
    with open('package.json', 'r') as f:
        pkg = json.load(f)
        pkg_version = pkg['version']

    with open('projects/app/version.json', 'r') as f:
        ver_file = json.load(f)
        ver_file_version = ver_file['version']

    with open('projects/app/manifest.chrome.json', 'r') as f:
        manifest = json.load(f)
        manifest_version = manifest['version']

    if pkg_version == ver_file_version == manifest_version:
        print(f"Version check passed: {pkg_version}")
        return True
    else:
        print(f"Version mismatch! package.json: {pkg_version}, version.json: {ver_file_version}, manifest: {manifest_version}")
        return False

if __name__ == "__main__":
    if not check_versions():
        sys.exit(1)
