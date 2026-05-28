#!/usr/bin/env bash

# ==========================================
#  PropMap Setup Automation Script
#  Supported OS: macOS & Linux
# ==========================================

# Định nghĩa màu sắc hiển thị cho giao diện terminal
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

clear
echo -e "${BLUE}======================================================${NC}"
echo -e "${CYAN}          PropMap — Khởi Tạo Môi Trường Tự Động       ${NC}"
echo -e "${BLUE}======================================================${NC}"
echo ""

# HÀM BÁO LỖI VÀ DỪNG CHẠY
error_exit() {
    echo -e "${RED}[LỖI] $1${NC}"
    exit 1
}

# HÀM HIỂN THỊ TIẾN TRÌNH THÀNH CÔNG
success_log() {
    echo -e "${GREEN}[OK] $1${NC}"
}

# HÀM HIỂN THỊ THÔNG BÁO CHỜ
info_log() {
    echo -e "${YELLOW}[...] $1${NC}"
}

# --------------------------------------------------
# 1. KIỂM TRA PYTHON 3
# --------------------------------------------------
info_log "Đang kiểm tra môi trường Python 3..."
if ! command -v python3 &> /dev/null; then
    error_exit "Không tìm thấy Python 3 trên hệ thống này. Vui lòng cài đặt Python 3 trước khi tiếp tục."
fi
PYTHON_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
success_log "Tìm thấy Python 3 (Phiên bản: $PYTHON_VERSION)"

# --------------------------------------------------
# 2. KIỂM TRA & TẢI ĐƯỜNG DẪN NODE.JS (NVM COMPATIBLE)
# --------------------------------------------------
info_log "Đang kiểm tra môi trường Node.js..."

# Nạp cấu hình NVM tự động nếu hệ thống đang cài đặt NVM để tránh lỗi command not found
if [ -s "$HOME/.nvm/nvm.sh" ]; then
    info_log "Phát hiện NVM được cài đặt. Đang tải môi trường NVM..."
    source "$HOME/.nvm/nvm.sh"
fi

# Tìm kiếm phiên bản Node.js tối ưu trên máy của người dùng
# Nếu lệnh `node` chưa có hoặc phiên bản hiện tại < 20.19, ta cố gắng tìm kiếm trong thư mục NVM các phiên bản hiện đại
NODE_VERSION_OK=false
if command -v node &> /dev/null; then
    NODE_CUR_VER=$(node -v | cut -d'v' -f2)
    NODE_MAJOR=$(echo "$NODE_CUR_VER" | cut -d'.' -f1)
    if [ "$NODE_MAJOR" -ge 20 ]; then
        NODE_VERSION_OK=true
        success_log "Tìm thấy Node.js tương thích (Phiên bản: v$NODE_CUR_VER)"
    fi
fi

if [ "$NODE_VERSION_OK" = false ]; then
    info_log "Phiên bản Node mặc định quá cũ hoặc chưa được chọn. Đang tìm phiên bản Node.js >= 20 khả dụng..."
    
    # Duyệt tìm trong thư mục cài đặt của NVM các bản Node 20, 21, 22, 23, 24, 25
    BEST_NODE_PATH=""
    for v in 25 24 23 22 21 20; do
        FOUND_PATH=$(find "$HOME/.nvm/versions/node" -maxdepth 1 -name "v$v.*" -print -quit 2>/dev/null)
        if [ -n "$FOUND_PATH" ]; then
            BEST_NODE_PATH="$FOUND_PATH/bin"
            break
        fi
    done

    if [ -n "$BEST_NODE_PATH" ]; then
        export PATH="$BEST_NODE_PATH:$PATH"
        NODE_CUR_VER=$(node -v | cut -d'v' -f2)
        success_log "Đã tự động chuyển sang sử dụng Node.js v$NODE_CUR_VER tại $BEST_NODE_PATH"
    else
        if command -v node &> /dev/null; then
            echo -e "${YELLOW}[CẢNH BÁO] Phiên bản Node.js hiện tại là v$NODE_CUR_VER (Yêu cầu khuyến nghị >= v20.19.0).${NC}"
        else
            error_exit "Không tìm thấy Node.js trên hệ thống này. Vui lòng cài đặt Node.js phiên bản LTS (khuyên dùng v22 hoặc v25)."
        fi
    fi
fi

# --------------------------------------------------
# 3. KÍCH HOẠT VIRTUAL ENVIRONMENT PYTHON
# --------------------------------------------------
info_log "Đang thiết lập môi trường ảo Python (Virtual Environment)..."
if [ ! -d ".venv" ]; then
    python3 -m venv .venv || error_exit "Không thể khởi tạo thư mục .venv."
    success_log "Đã tạo thư mục môi trường ảo .venv thành công."
else
    success_log "Môi trường ảo .venv đã tồn tại sẵn."
fi

info_log "Đang kích hoạt môi trường ảo..."
source .venv/bin/activate || error_exit "Không thể kích hoạt môi trường ảo .venv."
success_log "Môi trường ảo đã được kích hoạt."

# --------------------------------------------------
# 4. CÀI ĐẶT THƯ VIỆN PYTHON (BACKEND)
# --------------------------------------------------
info_log "Đang cập nhật trình quản lý gói pip..."
pip install --upgrade pip &> /dev/null

info_log "Đang cài đặt các thư viện Python cần thiết từ requirements.txt..."
pip install -r requirements.txt || error_exit "Lỗi trong quá trình cài đặt thư viện Python."
success_log "Đã cài đặt thành công toàn bộ thư viện Backend."

info_log "Đang cài đặt trình duyệt tự động cho Playwright (dùng cho Crawler)..."
playwright install chromium || error_exit "Không thể tải trình duyệt Chromium cho Playwright."
success_log "Đã cài đặt thành công nhân trình duyệt tự động."

# --------------------------------------------------
# 5. CÀI ĐẶT THƯ VIỆN NODE.JS (FRONTEND)
# --------------------------------------------------
info_log "Đang chuyển vào thư mục frontend..."
cd frontend || error_exit "Không tìm thấy thư mục frontend."

info_log "Đang tiến hành dọn dẹp các thư viện Node.js cũ để tránh xung đột..."
rm -rf node_modules package-lock.json

info_log "Đang tải và liên kết các gói thư viện frontend mới..."
npm install || error_exit "Lỗi trong quá trình cài đặt thư viện Frontend."
success_log "Đã cài đặt thành công toàn bộ thư viện Frontend."

cd ..

# --------------------------------------------------
# 6. HOÀN TẤT & IN THÔNG TIN
# --------------------------------------------------
echo ""
echo -e "${GREEN}======================================================${NC}"
echo -e "${GREEN}         THIẾT LẬP DỰ ÁN PROPMAP HOÀN TẤT!           ${NC}"
echo -e "${GREEN}======================================================${NC}"
echo ""
echo -e "Để khởi chạy đồng thời cả Backend và Frontend, mày chỉ cần gõ:"
echo -e "  ${CYAN}python start.py${NC}"
echo ""
echo -e "Nếu muốn chạy thủ công từng phần bằng terminal khác:"
echo -e "  - Backend API:  ${CYAN}source .venv/bin/activate && uvicorn api.main:app --reload${NC}"
echo -e "  - Frontend UI:  ${CYAN}cd frontend && npm run dev${NC}"
echo ""
echo -e "${BLUE}======================================================${NC}"
