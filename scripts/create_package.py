import zipfile
import os
import json

def create_package():
    with open('projects/app/version.json', 'r') as f:
        version = json.load(f)['version']

    output_filename = f"OmniView-Solo-v{version}.zip"
    os.makedirs('releases', exist_ok=True)

    opencv_path = os.path.join('projects', 'app', 'shared', 'js', 'lib', 'opencv.js')
    if not os.path.exists(opencv_path):
        raise FileNotFoundError(f"Critical dependency missing: {opencv_path}. Please ensure OpenCV.js is downloaded before packaging.")

    with zipfile.ZipFile(os.path.join('releases', output_filename), 'w') as zipf:
        # App files
        for root, dirs, files in os.walk('projects/app'):
            for file in files:
                filepath = os.path.join(root, file)
                arcname = os.path.relpath(filepath, 'projects/app')
                zipf.write(filepath, arcname)


    print(f"Created package: {output_filename}")

if __name__ == "__main__":
    create_package()
