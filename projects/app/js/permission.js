document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const message = chrome.i18n.getMessage(key);
        if (message) el.textContent = message;
    });
});

document.getElementById('grant-btn').addEventListener('click', async (e) => {
    const grantBtn = e.currentTarget;
    const statusMsg = document.getElementById('status-msg');

    grantBtn.disabled = true;
    statusMsg.textContent = '';

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        // Stop tracks immediately as we only needed the permission
        stream.getTracks().forEach(track => track.stop());

        statusMsg.textContent = chrome.i18n.getMessage('permissionGranted');
        statusMsg.style.color = 'green';

        // Try to close the tab automatically after a delay
        setTimeout(() => {
            window.close();
        }, 2000);
    } catch (err) {
        console.error('Permission request failed:', err);
        statusMsg.textContent = chrome.i18n.getMessage('permissionError', [err.message]);
        statusMsg.style.color = 'red';
        grantBtn.disabled = false;
    }
});
