/**
 * 전역 UI 헬퍼 모듈
 * 로딩, 프로그래스바 등 공통 UI 기능 제공
 * 
 * @author DOCORE
 */

(function() {
    'use strict';

    /**
     * 전역 로딩 UI 관리 객체
     */
    const GlobalLoader = {
        overlay: null,
        spinner: null,
        text: null,
        progressBar: null,
        progressFill: null,
        isVisible: false,

        /**
         * 로딩 오버레이 초기화 (DOM에 추가)
         */
        init() {
            if (this.overlay) return; // 이미 초기화됨

            this.overlay = document.createElement('div');
            this.overlay.id = 'globalLoaderOverlay';
            this.overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(15, 23, 42, 0.75);
                display: none;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                backdrop-filter: blur(4px);
                flex-direction: column;
                gap: 20px;
            `;

            // 스피너 컨테이너
            const spinnerContainer = document.createElement('div');
            spinnerContainer.style.cssText = `
                width: 50px;
                height: 50px;
                border: 4px solid rgba(255, 255, 255, 0.3);
                border-top-color: #667eea;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            `;

            // 스피너 애니메이션 키프레임 추가
            if (!document.getElementById('globalLoaderStyles')) {
                const style = document.createElement('style');
                style.id = 'globalLoaderStyles';
                style.textContent = `
                    @keyframes spin {
                        to { transform: rotate(360deg); }
                    }
                `;
                document.head.appendChild(style);
            }

            this.spinner = spinnerContainer;

            // 텍스트
            this.text = document.createElement('div');
            this.text.id = 'globalLoaderText';
            this.text.style.cssText = `
                color: white;
                font-size: 16px;
                font-weight: 500;
                text-align: center;
            `;

            // 프로그래스바 컨테이너
            const progressContainer = document.createElement('div');
            progressContainer.style.cssText = `
                width: 300px;
                max-width: 90%;
                display: none;
                flex-direction: column;
                gap: 8px;
            `;

            this.progressBar = document.createElement('div');
            this.progressBar.style.cssText = `
                width: 100%;
                height: 6px;
                background: rgba(255, 255, 255, 0.2);
                border-radius: 3px;
                overflow: hidden;
            `;

            this.progressFill = document.createElement('div');
            this.progressFill.style.cssText = `
                height: 100%;
                width: 0%;
                background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
                border-radius: 3px;
                transition: width 0.3s ease;
            `;

            this.progressBar.appendChild(this.progressFill);
            progressContainer.appendChild(this.progressBar);

            // 프로그래스 텍스트
            const progressText = document.createElement('div');
            progressText.id = 'globalLoaderProgressText';
            progressText.style.cssText = `
                color: rgba(255, 255, 255, 0.9);
                font-size: 13px;
                text-align: center;
            `;
            progressContainer.appendChild(progressText);

            this.overlay.appendChild(this.spinner);
            this.overlay.appendChild(this.text);
            this.overlay.appendChild(progressContainer);
            this.overlay.appendChild(document.getElementById('globalLoaderProgressText') || progressText);

            document.body.appendChild(this.overlay);
        },

        /**
         * 로딩 오버레이 표시
         * @param {string} message - 표시할 메시지
         * @param {boolean} showProgress - 프로그래스바 표시 여부
         */
        show(message = '처리 중입니다...', showProgress = false) {
            this.init();
            
            if (this.text) {
                this.text.textContent = message;
            }
            
            if (this.progressBar && this.progressBar.parentElement) {
                this.progressBar.parentElement.style.display = showProgress ? 'flex' : 'none';
            }
            
            if (this.progressFill) {
                this.progressFill.style.width = '0%';
            }

            this.overlay.style.display = 'flex';
            this.isVisible = true;

            // 스크롤 방지
            document.body.style.overflow = 'hidden';
        },

        /**
         * 프로그래스 업데이트 (0~100)
         * @param {number} percent - 진행률 (0~100)
         * @param {string} message - 업데이트할 메시지 (선택)
         */
        updateProgress(percent, message = null) {
            if (!this.isVisible) return;

            this.init();

            if (this.progressFill) {
                const clampedPercent = Math.max(0, Math.min(100, percent));
                this.progressFill.style.width = `${clampedPercent}%`;
            }

            if (this.progressBar && this.progressBar.parentElement) {
                this.progressBar.parentElement.style.display = 'flex';
            }

            if (message && this.text) {
                this.text.textContent = message;
            }

            const progressText = document.getElementById('globalLoaderProgressText');
            if (progressText) {
                progressText.textContent = `${Math.floor(percent)}%`;
            }
        },

        /**
         * 로딩 오버레이 숨기기
         */
        hide() {
            if (!this.overlay) return;

            this.overlay.style.display = 'none';
            this.isVisible = false;

            // 스크롤 복원
            document.body.style.overflow = '';

            // 프로그래스 초기화
            if (this.progressFill) {
                this.progressFill.style.width = '0%';
            }
        }
    };

    // 전역 객체로 노출
    window.GlobalLoader = GlobalLoader;

    // DOMContentLoaded 시 자동 초기화
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            GlobalLoader.init();
        });
    } else {
        GlobalLoader.init();
    }
})();
