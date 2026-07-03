import json
import sys
import os
import re
import subprocess

def get_current_version():
    with open('package.json', 'r') as f:
        pkg = json.load(f)
        return pkg['version']

def check_consistency():
    pkg_version = get_current_version()

    with open('package-lock.json', 'r') as f:
        lock = json.load(f)
        lock_version = lock['version']

    with open('projects/app/version.json', 'r') as f:
        ver_file = json.load(f)
        ver_file_version = ver_file['version']

    with open('projects/app/manifest.chrome.json', 'r') as f:
        manifest = json.load(f)
        manifest_version = manifest['version']

    readme_version = None
    if os.path.exists('README.md'):
        with open('README.md', 'r') as f:
            content = f.read()
            match = re.search(r'version-(\d+\.\d+\.\d+)-blue', content)
            if match:
                readme_version = match.group(1)

    app_html_version = None
    if os.path.exists('projects/app/app.html'):
        with open('projects/app/app.html', 'r') as f:
            content = f.read()
            match = re.search(r'<p>Version: (\d+\.\d+\.\d+)</p>', content)
            if match:
                app_html_version = match.group(1)

    if pkg_version == lock_version == ver_file_version == manifest_version == readme_version == app_html_version:
        print(f"Version consistency check passed: {pkg_version}")
        return True
    else:
        print(f"Version mismatch! package.json: {pkg_version}, package-lock.json: {lock_version}, version.json: {ver_file_version}, manifest: {manifest_version}, README: {readme_version}, app.html: {app_html_version}")
        return False

def check_version_bump():
    try:
        # Determine base reference for comparison
        # In CI (GitHub Actions), GITHUB_BASE_REF is set for PRs.
        base_ref = os.environ.get('GITHUB_BASE_REF')
        if not base_ref:
            # Fallback for local: compare against HEAD (for pre-commit) or origin/main
            try:
                subprocess.check_output(['git', 'rev-parse', '--verify', 'HEAD'], stderr=subprocess.STDOUT)
                base_ref = 'HEAD'
            except:
                return True # Not a git repo or no HEAD

        # Check if any source files changed
        changed_files = subprocess.check_output(
            ['git', 'diff', '--name-only', base_ref],
            stderr=subprocess.STDOUT
        ).decode('utf-8').splitlines()

        source_changed = any(
            f.startswith('projects/app/') or f.startswith('shared/')
            for f in changed_files
        )

        if not source_changed:
            return True

        # If source changed, check if version changed
        try:
            old_pkg_json = subprocess.check_output(
                ['git', 'show', f'{base_ref}:package.json'],
                stderr=subprocess.STDOUT
            ).decode('utf-8')
            old_version = json.loads(old_pkg_json)['version']
        except:
            # If package.json didn't exist in base_ref or other error, skip bump check
            return True

        current_version = get_current_version()
        if current_version == old_version:
            print(f"Error: Source files in 'projects/app/' or 'shared/' were modified, but version remains at {current_version}.")
            print("Please run 'npm run version:bump' to increment the version.")
            return False

        return True
    except subprocess.CalledProcessError:
        # Git command failed, possibly shallow clone or other issue
        return True

if __name__ == "__main__":
    if not check_consistency():
        sys.exit(1)

    if not check_version_bump():
        sys.exit(1)
