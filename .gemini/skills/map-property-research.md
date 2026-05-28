---
name: map-property-research
description: >
  Dùng khi user upload ảnh bản đồ có khoanh vùng (vòng tròn, polygon, annotation)
  và hỏi về bất động sản trong vùng đó — liệt kê chung cư, giá thuê, khoảng cách,
  tiện ích. Trigger ngay khi thấy ảnh bản đồ kèm câu hỏi BĐS dù user không nhắc
  "skill". Cũng dùng khi user nói "tìm chung cư trong khu này", "dự án trong vùng
  khoanh đỏ", "nghiên cứu BĐS khu vực X".
---

# Map Property Research

## Đọc bản đồ trước — không skip

Xác định từ ảnh: (1) landmark trung tâm vùng, (2) quận/phường nào bị cắt qua,
(3) trục đường chính trong vùng. Tóm tắt ngắn rồi mới search.

## Search theo cụm, không search tổng

Mỗi quận trong vùng: ít nhất 2 search riêng theo trục đường — 1 phía bắc/tây,
1 phía nam/đông. Nguồn theo thứ tự: batdongsan.com.vn → rever.vn → nhatot.com.

Chung cư cũ / nhà nước / tái định cư thường không có trên portal BĐS — search
thêm Google Maps với query "chung cư [phường] [quận]".

## Cross-check và verify vị trí

Dự án ≥2 nguồn → đưa vào. Dự án 1 nguồn → search thêm trước khi quyết định.
Dự án ở rìa vùng → ghi chú "(rìa — cần xác nhận)". Rõ ràng ngoài vùng → bỏ.

## Thu thập đủ các trường này cho mỗi dự án

Tên | Địa chỉ đầy đủ | Năm bàn giao | Giá thuê 2PN có NT | Giá thuê 2PN không NT
| Km đến điểm tham chiếu (đường xe) | Có ban công không

Giá thuê: search "cho thuê 2PN [tên dự án] 2025". Luôn ghi dạng range ("10–14 tr").
Không tìm được → "N/A", không bịa. Khoảng cách: đường xe thực tế, không phải chim bay.

## Xuất kết quả

Markdown table thẳng trong chat, nhóm theo quận.
