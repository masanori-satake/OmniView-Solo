import json
import sys

def bump_version(part='patch'):
    with open('package.json', 'r') as f:
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

    # Update all files
    for filepath in ['package.json', 'package-lock.json', 'projects/app/version.json', 'projects/app/manifest.chrome.json']:
        with open(filepath, 'r') as f:
            data = json.load(f)

        data['version'] = new_version
        if filepath == 'package-lock.json' and 'packages' in data and '' in data['packages']:
            data['packages']['']['version'] = new_version

        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)
            f.write('\n')

    # Update README.md badge
    import re
    with open('README.md', 'r') as f:
        content = f.read()
    new_content = re.sub(r'version-\d+\.\d+\.\d+-blue', f'version-{new_version}-blue', content)
    with open('README.md', 'w') as f:
        f.write(new_content)

    print(f"Bumped version to {new_version}")

if __name__ == "__main__":
    part = sys.argv[1] if len(sys.argv) > 1 else 'patch'
    bump_version(part)
