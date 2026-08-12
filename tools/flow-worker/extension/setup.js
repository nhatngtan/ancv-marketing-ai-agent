const profileId = document.querySelector('meta[name="ancv-profile-id"]')?.content;
const nonce = document.querySelector('meta[name="ancv-setup-nonce"]')?.content;
const nextUrl = document.querySelector('meta[name="ancv-next-url"]')?.content;

if (profileId && nonce && nextUrl) {
  chrome.runtime.sendMessage({ type: 'ancv-bridge-setup', profileId, nonce, nextUrl }, (response) => {
    const message = document.getElementById('status');
    if (message) message.textContent = response?.ok ? 'Browser Bridge đã kết nối. Đang mở Google Flow…' : 'Không thể kết nối Browser Bridge.';
    if (response?.ok) window.setTimeout(() => window.location.replace(nextUrl), 300);
  });
}
