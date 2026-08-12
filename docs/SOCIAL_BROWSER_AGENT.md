# Social Browser Agent (Experimental)

Giai đoạn 2F-B bổ sung cầu nối Local Agent cho Facebook, TikTok, LinkedIn và Zalo theo chế độ browser preflight chỉ đọc. Đây không phải Social API và chưa cho phép đăng bài.

## Luồng

Dashboard → Firestore command → ANCV Local Agent → Chrome Profile do Admin chọn → ANCV Browser Bridge → website nền tảng.

Admin quét metadata từ Chrome `Local State`, chọn profile cho từng kênh và lưu mapping. Local Agent tự resolve đường dẫn local; Web App và Firestore không lưu filesystem path.

## Dữ liệu được lưu

- profile key/directory;
- display label;
- email nếu Chrome đã công khai trong metadata profile;
- machine ID, platform, thời gian và người cập nhật mapping;
- kết quả preflight không chứa credential.

Không đọc hoặc lưu cookie database, password database, token, browsing history hay nội dung Chrome profile.

## Trạng thái và giới hạn

- `ready`, `login_required`, `bridge_required`, `unavailable`, `not_tested` cho profile;
- `not_configured`, `ready_for_write_test`, `login_required`, `verification_required`, `unavailable`, `not_tested` cho platform;
- preflight chỉ inspect session/account và các control hiển thị; không click composer, upload hoặc publish;
- nếu profile chưa có Browser Bridge hoặc session hết hạn, job dừng an toàn để người dùng xử lý;
- một browser task chạy tại một thời điểm; không profile rotation và không chạy song song;
- social mapping không được tự chọn. Chỉ Admin quyết định profile.

Google Flow vẫn giữ nhãn `EXPERIMENTAL`; engine hiện hữu không bị thay đổi bởi module Social Browser Agent.
