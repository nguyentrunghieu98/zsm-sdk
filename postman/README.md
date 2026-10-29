# Thử hợp đồng API bằng Postman

## Import

Import hai file:

- `zsm-sdk.postman_collection.json`
- `zsm-sdk.postman_environment.json`

Chọn environment `zsm-sdk - Local manual test`. Hai giá trị `baseUrl` và `loginBaseUrl` trong file là placeholder; thay bằng host workspace và host đăng nhập thật trước khi chạy. Bộ file không chứa credential thật, không có script tự đăng nhập hoặc tự gửi request.

## Chuẩn bị phiên

Cách thử đầu tiên là dùng token của một phiên workspace đang đăng nhập hợp lệ:

1. Mở workspace trên trình duyệt và đăng nhập.
2. Mở DevTools → Application → Local Storage → origin của workspace.
3. Lấy giá trị `userToken`, điền vào biến `accessToken` của environment Postman. Không thêm chữ `Bearer` vào giá trị.
4. Giữ token/password ở biến local của Postman, không chia sẻ hoặc commit environment đã điền thông tin phiên.

Nếu không thấy `userToken`, xem request `auth/verify` hoặc `account/getAll` trong Network để đối chiếu header Authorization của chính phiên đó. Chưa xác định đầy đủ yêu cầu cookie. Postman không tự dùng cookie trong trình duyệt, vì vậy chỉ có token có thể chưa đủ.

## Thứ tự thử

| Request | Việc cần làm |
| --- | --- |
| 01 - Verify session | Kiểm tra status và body. Nếu phản hồi có token mới thì tự cập nhật `accessToken` |
| 02 - List Zalo accounts | Chọn tài khoản sale, sao chép `accountId` vào environment |
| 03 - List tags | Chọn thẻ cần thử, sao chép `tagId` |
| 04 - Search by phone and account | Điền `phone` dạng quốc tế. Đọc `data.profile.userId` và `data.conversation.id`, cập nhật `userId` và `conversationId` |
| 05 - Check friendship status | Kiểm tra tình trạng hiện tại trước khi gửi lời mời |
| 06 - Send friend request | Gửi lời mời thật với `friendRequestMessage`. Sau đó chạy lại request 05 để đối chiếu |
| 07 - Toggle conversation tag | Bật hoặc tắt thẻ trên hội thoại, tùy trạng thái hiện tại |

Không chạy cả collection bằng Runner. Request 06 gửi lời mời thật, request 07 thay đổi thẻ và thư mục cuối có thử đăng nhập.

Các ID trong request JSON được gửi dạng chuỗi để giữ nguyên định danh dài. Đây là lựa chọn của bộ thử, chưa xác minh kiểu dữ liệu server yêu cầu. Nếu bị lỗi validation, đối chiếu payload của request tương ứng trong trình duyệt trước khi điều chỉnh.

Không tạo `conversationId` bằng cách tự ghép ID. Nếu kết quả tìm kiếm không trả về hội thoại hợp lệ, dừng bước gắn thẻ và đối chiếu phản hồi. Hai biến `userId` và `conversationId` không được tự cập nhật để bạn kiểm tra đúng khách trước khi thao tác.

## Thử nhiều sale

Lần đầu chỉ thử một tài khoản và một khách được chọn. Với sale tiếp theo:

1. Đổi `accountId`.
2. Xóa `userId` và `conversationId` cũ.
3. Chạy lại tìm kiếm và trạng thái kết bạn.
4. Cập nhật ID từ kết quả mới trước khi gửi lời mời hoặc đổi thẻ.

Không dùng lại `conversationId` của tài khoản trước. Bộ Postman này chưa chạy hàng loạt hoặc tự chia khách giữa nhiều sale.

## Đăng nhập username/password

Thư mục 04 có hai request thử nghiệm:

- GET form `/login?target=zalo`.
- POST form với `username`, `password`, `targetUrl`.

Hai request dùng No Auth và tắt tự theo redirect để xem status/Location. Bạn chỉ cần điền username/password nếu muốn khảo sát luồng này. Không cần chúng khi thử bằng token phiên có sẵn.

Form được đọc từ HTML công khai, chưa kiểm chứng đăng nhập thành công hoặc bàn giao token sang ứng dụng Zalo. Phản hồi có thể là HTML thay vì JSON. Bộ Postman không tự lấy token sau bước này.

## Đọc lỗi

- Đọc cả HTTP status và body, không chỉ nhìn HTTP 200.
- Caller frontend có kiểm tra `data.error_code` và `data.error_message` ở một số API. Các API không nhất thiết dùng chung một envelope.
- GET verify không token/cookie đã trả HTTP 500 khi khảo sát. Không tự kết luận mọi HTTP 500 đều là lỗi token.
- Không tự gửi lại lời mời khi chưa biết request trước đã xử lý hay chưa.
- Endpoint gắn thẻ được frontend dùng cho cả gắn và bỏ. Gọi lại có thể đảo trạng thái.

## Mức độ kiểm chứng

Collection dựa trên mã frontend công khai ngày 29/10/2026. Cấu trúc file và biến đã được kiểm tra cục bộ. Các request trong collection chưa được chạy bằng credential thật, chưa gửi lời mời hoặc thay đổi thẻ.
