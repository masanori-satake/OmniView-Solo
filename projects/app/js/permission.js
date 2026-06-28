document.getElementById('grant-btn').addEventListener('click', async () => {
    const statusMsg = document.getElementById('status-msg');
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        // Stop tracks immediately as we only needed the permission
        stream.getTracks().forEach(track => track.stop());

        statusMsg.textContent = '許可されました。このタブを閉じてサイドパネルに戻ってください。';
        statusMsg.style.color = 'green';

        // Try to close the tab automatically after a delay
        setTimeout(() => {
            window.close();
        }, 2000);
    } catch (err) {
        console.error('Permission request failed:', err);
        statusMsg.textContent = 'エラー: ' + err.message;
        statusMsg.style.color = 'red';
    }
});
