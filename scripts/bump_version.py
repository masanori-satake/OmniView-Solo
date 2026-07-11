import json
import sys
import re

def bump_version(part='patch'):
    with open('package.json', 'r', encoding='utf-8') as f:
        pkg = json.load(f)

    version = pkg['version'].split('.')
    if part == 'major':
        version[0] = str(int(version[0]) + 1)
        version[1] = '0'
        version[2] = '0'
    elif part == 'minor':
        version[1] = str(int(version[1]) + 1)
        version[2] = '0'
    else:
        version[2] = str(int(version[2]) + 1)

    new_version = '.'.join(version)

    import re
    # Update all files
    for filepath in ['package.json', 'package-lock.json', 'projects/app/version.json', 'projects/app/manifest.chrome.json']:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)

        data['version'] = new_version
        if filepath == 'package-lock.json' and 'packages' in data and '' in data['packages']:
            data['packages']['']['version'] = new_version

        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write('\n')

    # Update app.html
    app_html_path = 'projects/app/app.html'
    with open(app_html_path, 'r', encoding='utf-8') as f:
        content = f.read()
    # Match both active tag (with attributes) and comment tag
    new_content = re.sub(r'(<p[^>]*>Version: )\d+\.\d+\.\d+(</p>)', rf'\g<1>{new_version}\g<2>', content)
    with open(app_html_path, 'w', encoding='utf-8') as f:
        f.write(new_content)

    # Update README.md badge
    with open('README.md', 'r', encoding='utf-8') as f:
        content = f.read()
    new_content = re.sub(r'version-\d+\.\d+\.\d+-blue', f'version-{new_version}-blue', content)
    with open('README.md', 'w', encoding='utf-8') as f:
        f.write(new_content)

    print(f"Bumped version to {new_version}")

if __name__ == "__main__":
    part = sys.argv[1] if len(sys.argv) > 1 else 'patch'
    bump_version(part)
