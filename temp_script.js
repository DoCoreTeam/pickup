      // ========================================
      // 🛡️ 전역 상수 및 변수 정의 (안전성 우선)
      // ========================================
      
      // API_BASE를 현재 도메인에 맞게 동적 설정
      const API_BASE = '/api';
      let currentStore = null;
      let currentStoreId = null;
      let settings = {};
      let isLoading = true;

      // ========================================
      // 🔧 유틸리티 함수들
      // ========================================

      function log(level, message, data = null) {
        const timestamp = new Date().toISOString();
        if (data) {
          console.log(`[${timestamp}] [${level}] ${message}`, data);
        } else {
          console.log(`[${timestamp}] [${level}] ${message}`);
        }
      }

      async function apiRequest(url, options = {}) {
        try {
          const response = await fetch(url, {
            headers: {
              'Content-Type': 'application/json',
              ...options.headers
            },
            ...options
          });

          if (!response.ok) {
            throw new Error(`HTTP 오류: ${response.status}`);
          }

          return await response.json();
        } catch (error) {
          log('ERROR', 'API 요청 실패', { url, error: error.message });
          throw error;
        }
      }

      function getStoreIdFromUrl() {
        // URL 파라미터에서 storeId 또는 id 확인
        const urlParams = new URLSearchParams(window.location.search);
        const storeIdFromParam = urlParams.get('storeId') || urlParams.get('id');
        
        if (storeIdFromParam) {
          return storeIdFromParam;
        }
        
        // 기존 경로 기반 파싱 (하위 호환성)
        const path = window.location.pathname;
        const match = path.match(/\/store\/([^\/]+)/);
        return match ? match[1] : null;
      }

      // ========================================
      // 🏪 가게 관련 함수들
      // ========================================

      async function loadStoreInfo(storeId) {
        try {
          log('INFO', '가게 정보 로딩 시작', { storeId });
          const data = await apiRequest(`${API_BASE}/data`);
          
          if (data && data.stores && Array.isArray(data.stores)) {
            const store = data.stores.find(s => s.id === storeId);
            if (store) {
              // 가게가 중지된 경우 중지 페이지로 리다이렉트
              if (store.status === 'paused') {
                log('WARN', '가게가 중지됨, 중지 페이지로 리다이렉트', { storeId });
                window.location.href = '/paused.html';
                return;
              }
              
              currentStore = store;
              log('INFO', '가게 정보 로딩 완료', store);
              return store;
            } else {
              throw new Error('가게를 찾을 수 없습니다');
            }
          } else {
            throw new Error('가게 데이터가 없습니다');
          }
        } catch (error) {
          log('ERROR', '가게 정보 로딩 실패', error);
          throw error;
        }
      }

      async function loadSettings(storeId) {
        try {
          log('INFO', '설정 로딩 시작', { storeId });
          const settingsData = await apiRequest(`${API_BASE}/settings?storeId=${storeId}`);
          
          // API 응답이 직접 설정 데이터인 경우
          if (settingsData && (settingsData.images || settingsData.pickupTitle)) {
            settings = settingsData;
            log('INFO', '설정 로딩 완료', settings);
            return settings;
          }
          // API 응답이 {success: true, data: {...}} 형태인 경우
          else if (settingsData && settingsData.success && settingsData.data) {
            settings = settingsData.data;
            log('INFO', '설정 로딩 완료', settings);
            return settings;
          }
          // 설정 데이터가 없는 경우
          else {
            log('WARN', '설정 데이터가 없음, 빈 객체 사용');
            settings = {};
            return settings;
          }
        } catch (error) {
          log('ERROR', '설정 로딩 실패', error);
          settings = {};
          return settings;
        }
      }

      function renderDeliveryApps() {
        const deliveryGrid = document.getElementById('deliveryGrid');
        if (!deliveryGrid) return;

        const appConfigs = {
          baemin: { name: '배달의민족', icon: '/assets/images/icons/bm.svg' },
          yogiyo: { name: '요기요', icon: '/assets/images/icons/yogiyo.png' },
          coupang: { name: '쿠팡이츠', icon: '/assets/images/icons/cpeat.png' },
          ttaeng: { name: '땡겨요', icon: '/assets/images/icons/dgy.svg' }
        };

        // 설정에서 배달앱 순서와 URL 가져오기
        const deliveryOrder = settings?.delivery?.deliveryOrder || ['ttaeng', 'baemin', 'coupang', 'yogiyo'];
        
        // URL이 있는 배달앱만 필터링
        const activeApps = deliveryOrder.filter(appId => {
          const url = settings?.delivery?.[`${appId}Url`] || '';
          return url && url.trim() !== '';
        });

        deliveryGrid.innerHTML = '';

        activeApps.forEach(appId => {
          const config = appConfigs[appId];
          if (!config) return;

          const deliveryBtn = document.createElement('a');
          deliveryBtn.href = '#';
          deliveryBtn.className = 'delivery-btn';
          deliveryBtn.setAttribute('onclick', `openDeliveryApp('${appId}')`);
          deliveryBtn.onclick = (e) => {
            e.preventDefault();
            openDeliveryApp(appId);
          };

          deliveryBtn.innerHTML = `
            <div class="delivery-logo">
              <img src="${config.icon}" alt="${config.name}" />
            </div>
            <div class="delivery-name">${config.name}</div>
          `;

          deliveryGrid.appendChild(deliveryBtn);
        });
      }

      function renderStorePage() {
        const contentDiv = document.getElementById('content');
        
        if (isLoading) {
          contentDiv.innerHTML = `
            <div class="loading">
              <div class="loading-spinner"></div>
              <div>가게 정보를 불러오는 중...</div>
            </div>
          `;
          return;
        }

        if (!currentStore) {
          contentDiv.innerHTML = `
            <div class="error">
              <div class="error-icon">❌</div>
              <h3>가게를 찾을 수 없습니다</h3>
              <p>요청하신 가게가 존재하지 않거나 삭제되었습니다.</p>
            </div>
          `;
          return;
        }

        // 페이지 제목 업데이트
        document.title = `${currentStore.name} - 픽업`;

        // 설정에서 로고 이미지 가져오기
        const logoImage = settings?.images?.mainLogo || '/assets/images/logos/default-logo.svg';

        contentDiv.innerHTML = `
          <div class="store-hero">
            <div class="store-info">
              <div class="store-logo">
                <img src="${logoImage}" alt="${currentStore.name} 로고" />
              </div>
              <div class="store-name">${currentStore.name || '가게명 없음'}</div>
              <div class="store-subtitle">${currentStore.subtitle || '전화·앱 한 번으로 바로 주문하세요'}</div>
            </div>
            
            <div class="phone-section">
              <div class="phone-number">${currentStore.phone || '전화번호 없음'}</div>
              <div class="phone-label">바로 전화 주문하기</div>
              <button class="phone-btn" onclick="callStore()">
                📞 전화하기
              </button>
            </div>
            
            <div id="businessHoursSection"></div>
          </div>

          <div class="quick-actions">
            <button class="action-btn" onclick="showMenu()">
              <span class="action-icon">📋</span>
              <span class="action-text">메뉴 보기</span>
            </button>
            <button class="action-btn" onclick="showLocation()">
              <span class="action-icon">📍</span>
              <span class="action-text">위치 보기</span>
            </button>
            ${settings?.pickup?.enabled ? `
            <button class="action-btn pickup-action" onclick="showPickupInfo()">
              <span class="action-icon">📦</span>
              <span class="action-text">픽업 안내</span>
            </button>
            ` : ''}
          </div>

          <!-- 동적 섹션 렌더링 -->
          <div id="dynamicSections">
            <!-- 섹션 순서에 따라 동적으로 생성됩니다 -->
          </div>
        `;

        // 배달앱 렌더링
        renderDeliveryApps();
        
        // 동적 섹션 렌더링
        renderDynamicSections();
        
        // 영업시간 렌더링
        const businessHoursSection = document.getElementById('businessHoursSection');
        if (businessHoursSection) {
          businessHoursSection.innerHTML = renderBusinessHours(settings);
        }
      }

      function showMenu() {
        // 설정에서 메뉴 이미지 가져오기
        const menuImage = settings?.images?.menuImage;
        
        if (menuImage) {
          // 메뉴 이미지가 있으면 현재 페이지에 모달로 표시
          log('INFO', '메뉴 이미지 표시', { menuImage });
          showMenuModal(menuImage);
        } else {
          // 메뉴 이미지가 없으면 알림 표시
          alert('메뉴 이미지가 등록되지 않았습니다. 관리자 페이지에서 메뉴 이미지를 업로드해주세요.');
        }
      }

      function showPickupInfo() {
        // 픽업 안내 모달 표시
        log('INFO', '픽업 안내 모달 표시');
        showPickupModal();
      }

      // 영업시간 렌더링
      function renderBusinessHours(settings) {
        // 영업시간 설정이 없으면 기본값 사용
        const businessHours = settings?.businessHours || {
          mon: { enabled: true, open: '09:00', close: '22:00' },
          tue: { enabled: true, open: '09:00', close: '22:00' },
          wed: { enabled: true, open: '09:00', close: '22:00' },
          thu: { enabled: true, open: '09:00', close: '22:00' },
          fri: { enabled: true, open: '09:00', close: '22:00' },
          sat: { enabled: true, open: '09:00', close: '22:00' },
          sun: { enabled: true, open: '09:00', close: '22:00' }
        };
        
        const dayNames = {
          mon: '월요일',
          tue: '화요일',
          wed: '수요일',
          thu: '목요일',
          fri: '금요일',
          sat: '토요일',
          sun: '일요일'
        };
        
        const today = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getDay()];
        const todayHours = businessHours[today];
        
        if (!todayHours || !todayHours.enabled) {
          return `
            <div style="margin-top: 12px; padding: 12px 16px; background: #fef3c7; border-radius: 8px; display: flex; align-items: center; justify-content: space-between;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 14px;">⏰</span>
                <span style="color: #92400e; font-weight: 600; font-size: 14px;">오늘은 휴무일입니다</span>
              </div>
              <button onclick="showAllBusinessHours()" style="padding: 4px 12px; background: white; border: 1px solid #f59e0b; border-radius: 6px; color: #f59e0b; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap;">전체보기</button>
            </div>
          `;
        }
        
        return `
          <div style="margin-top: 12px; padding: 12px 16px; background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border-radius: 8px; display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <span style="font-size: 14px;">⏰</span>
              <div>
                <div style="font-size: 18px; font-weight: 700; color: #1e3a8a;">
                  ${todayHours.open} - ${todayHours.close}
                </div>
              </div>
            </div>
            <button onclick="showAllBusinessHours()" style="padding: 4px 12px; background: white; border: 1px solid #3b82f6; border-radius: 6px; color: #3b82f6; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap;">전체보기</button>
          </div>
          <script>
            window.businessHoursData = ${JSON.stringify({ dayNames, businessHours, today })};
          <\/script>
        `;
      }
      
      // 동적 섹션 렌더링
      function renderDynamicSections() {
        try {
          const dynamicSections = document.getElementById('dynamicSections');
          if (!dynamicSections) {
            console.error('❌ dynamicSections 요소를 찾을 수 없습니다');
            return;
          }

          // 기본 섹션 순서 (설정이 없으면 기본값 사용)
          const defaultOrder = [
            { id: 'discount', title: '할인 안내', icon: '🎉', description: '할인 이벤트 정보' },
            { id: 'delivery', title: '배달 주문', icon: '🚚', description: '배달앱 주문 링크' },
            { id: 'address', title: '주소 정보', icon: '📍', description: '가게 주소 및 지도' }
          ];

          const sectionOrder = settings?.sectionOrder || defaultOrder;
          console.log('✅ 섹션 순서 로드:', sectionOrder);
          console.log('📊 settings 객체:', settings);
          
          dynamicSections.innerHTML = '';

          sectionOrder.forEach(section => {
            let sectionHTML = '';

            switch (section.id) {
              case 'discount':
                if (settings?.discount?.enabled) {
                  sectionHTML = `
                    <div class="discount-section">
                      <div class="discount-title">
                        🎉 ${settings.discount.title || '할인 이벤트'}
                      </div>
                      <div class="discount-description">
                        ${settings.discount.description || '할인 내용을 입력하세요'}
                      </div>
                    </div>
                  `;
                }
                break;

              case 'delivery':
                sectionHTML = `
                  <div class="delivery-section">
                    <div class="section-title">🚚 배달 주문</div>
                    <div class="delivery-grid" id="deliveryGrid">
                      <!-- 동적으로 생성됩니다 -->
                    </div>
                  </div>
                `;
                break;

              case 'address':
                sectionHTML = `
                  <div class="address-section">
                    <div class="section-title">📍 주소 정보</div>
                    <div class="address-text">
                      ${currentStore.address || '주소가 등록되지 않았습니다.'}
                    </div>
                    <div class="map-buttons">
                      <button class="map-btn" onclick="openNaverMap()">
                        🗺️ 네이버지도로 길찾기
                      </button>
                      <button class="map-btn" onclick="openTmap()">
                        🚗 T맵으로 길찾기
                      </button>
                    </div>
                  </div>
                `;
                break;
            }

            if (sectionHTML) {
              dynamicSections.innerHTML += sectionHTML;
            }
          });

          // 배달앱 렌더링 (delivery 섹션이 렌더링된 후)
          if (sectionOrder.some(s => s.id === 'delivery')) {
            renderDeliveryApps();
          }

        } catch (error) {
          console.error('동적 섹션 렌더링 실패:', error);
        }
      }

      function showPickupModal() {
        // 기존 모달이 있으면 제거
        const existingModal = document.getElementById('pickupModal');
        if (existingModal) {
          existingModal.remove();
        }

        // 픽업 설정이 없으면 알림 표시
        if (!settings?.pickup?.enabled) {
          alert('픽업 안내가 설정되지 않았습니다.');
          return;
        }

        // 모달 생성
        const modal = document.createElement('div');
        modal.id = 'pickupModal';
        modal.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          cursor: pointer;
          animation: fadeIn 0.3s ease-out;
        `;

        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
          max-width: 90%;
          max-height: 90%;
          background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
          border: 2px solid #0ea5e9;
          border-radius: 16px;
          padding: 24px;
          position: relative;
          cursor: default;
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 40px rgba(14, 165, 233, 0.3);
          animation: slideIn 0.4s ease-out;
        `;

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        closeBtn.style.cssText = `
          position: absolute;
          top: 12px;
          right: 16px;
          background: rgba(14, 165, 233, 0.1);
          border: 1px solid rgba(14, 165, 233, 0.3);
          border-radius: 50%;
          width: 32px;
          height: 32px;
          font-size: 16px;
          cursor: pointer;
          color: #0c4a6e;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        `;

        closeBtn.onmouseover = () => {
          closeBtn.style.background = 'rgba(14, 165, 233, 0.2)';
          closeBtn.style.transform = 'scale(1.1)';
        };
        closeBtn.onmouseout = () => {
          closeBtn.style.background = 'rgba(14, 165, 233, 0.1)';
          closeBtn.style.transform = 'scale(1)';
        };

        const header = document.createElement('div');
        header.style.cssText = `
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 20px;
          padding-bottom: 16px;
          border-bottom: 2px solid rgba(14, 165, 233, 0.2);
        `;

        const icon = document.createElement('div');
        icon.innerHTML = '📦';
        icon.style.cssText = `
          font-size: 28px;
          animation: bounce 2s ease-in-out infinite;
        `;

        const title = document.createElement('h2');
        title.textContent = settings.pickup.title || '픽업 안내';
        title.style.cssText = `
          font-size: 20px;
          font-weight: 700;
          color: #0c4a6e;
          margin: 0;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        `;

        const content = document.createElement('div');
        content.style.cssText = `
          background: rgba(255, 255, 255, 0.8);
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 20px;
          border: 1px solid rgba(14, 165, 233, 0.3);
          position: relative;
        `;

        const description = document.createElement('div');
        description.textContent = settings.pickup.description || '픽업 장소와 안내사항을 확인해주세요.';
        description.style.cssText = `
          font-size: 16px;
          color: #075985;
          line-height: 1.6;
          white-space: pre-line;
        `;

        const actions = document.createElement('div');
        actions.style.cssText = `
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        `;

        const locationBtn = document.createElement('button');
        locationBtn.innerHTML = `
          <span style="font-size: 18px; margin-right: 8px;">📍</span>
          위치 확인
        `;
        locationBtn.style.cssText = `
          background: linear-gradient(135deg, #0ea5e9, #0284c7);
          color: white;
          border: none;
          border-radius: 12px;
          padding: 14px 16px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(14, 165, 233, 0.3);
        `;
        locationBtn.onclick = () => {
          showLocation();
          modal.remove();
        };

        const callBtn = document.createElement('button');
        callBtn.innerHTML = `
          <span style="font-size: 18px; margin-right: 8px;">📞</span>
          전화 문의
        `;
        callBtn.style.cssText = `
          background: linear-gradient(135deg, #10b981, #059669);
          color: white;
          border: none;
          border-radius: 12px;
          padding: 14px 16px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
        `;
        callBtn.onclick = () => {
          callStore();
          modal.remove();
        };

        // 호버 효과
        [locationBtn, callBtn].forEach(btn => {
          btn.onmouseover = () => {
            btn.style.transform = 'translateY(-2px)';
            btn.style.boxShadow = '0 6px 16px rgba(14, 165, 233, 0.4)';
          };
          btn.onmouseout = () => {
            btn.style.transform = 'translateY(0)';
            btn.style.boxShadow = '0 4px 12px rgba(14, 165, 233, 0.3)';
          };
        });

        // 애니메이션 CSS 추가
        const style = document.createElement('style');
        style.textContent = `
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes slideIn {
            from { 
              opacity: 0;
              transform: translateY(30px) scale(0.9);
            }
            to { 
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
          @keyframes bounce {
            0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
            40% { transform: translateY(-4px); }
            60% { transform: translateY(-2px); }
          }
        `;
        document.head.appendChild(style);

        // 이벤트 리스너
        closeBtn.onclick = () => modal.remove();
        modal.onclick = (e) => {
          if (e.target === modal) modal.remove();
        };

        // DOM 구성
        header.appendChild(icon);
        header.appendChild(title);
        content.appendChild(description);
        actions.appendChild(locationBtn);
        actions.appendChild(callBtn);

        modalContent.appendChild(closeBtn);
        modalContent.appendChild(header);
        modalContent.appendChild(content);
        modalContent.appendChild(actions);
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
      }

      function showMenuModal(imageSrc) {
        // 기존 모달이 있으면 제거
        const existingModal = document.getElementById('menuModal');
        if (existingModal) {
          existingModal.remove();
        }

        // 모달 생성
        const modal = document.createElement('div');
        modal.id = 'menuModal';
        modal.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          cursor: pointer;
        `;

        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
          max-width: 90%;
          max-height: 90%;
          background: white;
          border-radius: 12px;
          padding: 20px;
          position: relative;
          cursor: default;
          display: flex;
          flex-direction: column;
        `;

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        closeBtn.style.cssText = `
          position: absolute;
          top: 10px;
          right: 15px;
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: #666;
          z-index: 10;
        `;

        const menuImg = document.createElement('img');
        menuImg.src = imageSrc;
        menuImg.style.cssText = `
          max-width: 100%;
          max-height: 70vh;
          object-fit: contain;
          border-radius: 8px;
          margin-bottom: 20px;
        `;

        // 전화하기 버튼 컨테이너
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `
          display: flex;
          justify-content: center;
          margin-top: auto;
        `;

        const callButton = document.createElement('button');
        callButton.innerHTML = '📞 전화하기';
        callButton.style.cssText = `
          background: var(--primary);
          color: white;
          border: none;
          border-radius: 8px;
          padding: 12px 24px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          gap: 8px;
        `;

        // 호버 효과
        callButton.onmouseover = () => {
          callButton.style.background = '#1e40af';
          callButton.style.transform = 'translateY(-2px)';
        };
        callButton.onmouseout = () => {
          callButton.style.background = 'var(--primary)';
          callButton.style.transform = 'translateY(0)';
        };

        // 전화하기 버튼 클릭 이벤트
        callButton.onclick = () => {
          if (currentStore && currentStore.phone) {
            window.location.href = `tel:${currentStore.phone}`;
          } else {
            alert('전화번호가 등록되지 않았습니다.');
          }
        };

        buttonContainer.appendChild(callButton);
        modalContent.appendChild(closeBtn);
        modalContent.appendChild(menuImg);
        modalContent.appendChild(buttonContainer);
        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        // 닫기 이벤트
        const closeModal = () => {
          modal.remove();
        };

        closeBtn.onclick = closeModal;
        modal.onclick = (e) => {
          if (e.target === modal) closeModal();
        };

        // ESC 키로 닫기
        const handleKeydown = (e) => {
          if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', handleKeydown);
          }
        };
        document.addEventListener('keydown', handleKeydown);
      }

      function showLocation() {
        if (currentStore && currentStore.address) {
          openNaverMap();
        } else {
          alert('주소가 등록되지 않았습니다.');
        }
      }

      function openDeliveryApp(app) {
        const appUrls = {
          baemin: 'https://baemin.me/',
          yogiyo: 'https://www.yogiyo.co.kr/',
          coupang: 'https://www.coupangeats.com/',
          ddangyo: 'https://www.ddangyo.com/'
        };
        
        if (appUrls[app]) {
          log('INFO', '배달 앱 열기', { app });
          window.open(appUrls[app], '_blank');
        }
      }

      function openNaverMap() {
        if (currentStore && currentStore.address) {
          const encodedAddress = encodeURIComponent(currentStore.address);
          const naverMapUrl = `https://map.naver.com/v5/search/${encodedAddress}`;
          log('INFO', '네이버지도 열기', { address: currentStore.address });
          window.open(naverMapUrl, '_blank');
        }
      }

      function openTmap() {
        if (currentStore && currentStore.address) {
          const encodedAddress = encodeURIComponent(currentStore.address);
          const tmapUrl = `https://tmapapi.sktelecom.com/main/search?query=${encodedAddress}`;
          log('INFO', 'T맵 열기', { address: currentStore.address });
          window.open(tmapUrl, '_blank');
        }
      }

      // ========================================
      // 🚀 초기화 및 이벤트 처리
      // ========================================

      async function initialize() {
        try {
          log('INFO', '페이지 초기화 시작');
          
          const storeId = getStoreIdFromUrl();
          if (!storeId) {
            throw new Error('가게 ID가 없습니다');
          }
          
          currentStoreId = storeId;
          
          // 가게 정보와 설정 동시 로딩
          const [storeData] = await Promise.all([
            loadStoreInfo(storeId),
            loadSettings(storeId)
          ]);
          
          isLoading = false;
          
          // 렌더링
          renderStorePage();
          
          // 로딩 오버레이 숨기기
          hideLoadingOverlay();
          
          log('INFO', '페이지 초기화 완료');
        } catch (error) {
          log('ERROR', '페이지 초기화 실패', error);
          isLoading = false;
          renderStorePage();
          
          // 로딩 오버레이 숨기기
          hideLoadingOverlay();
        }
      }

      // 로딩 오버레이 숨기기
      function hideLoadingOverlay() {
        console.log('🔄 로딩 오버레이 숨기기 시작');
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
          overlay.classList.add('fade-out');
          setTimeout(() => {
            overlay.style.display = 'none';
            console.log('✅ 로딩 오버레이 숨김 완료');
          }, 300);
        } else {
          console.error('❌ 로딩 오버레이 요소를 찾을 수 없음');
        }
      }

      // 전체 영업시간 모달 표시
      function showAllBusinessHours() {
        const data = window.businessHoursData;
        if (!data) return;
        
        const { dayNames, businessHours, today } = data;
        
        const modal = document.createElement('div');
        modal.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
          animation: fadeIn 0.2s ease-out;
        `;
        
        modal.innerHTML = `
          <div style="background: white; border-radius: 16px; padding: 24px; max-width: 400px; width: 100%; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
              <h3 style="margin: 0; font-size: 18px; font-weight: 700; color: #1e293b;">📅 전체 영업시간</h3>
              <button onclick="this.closest('div').parentElement.remove()" style="background: none; border: none; font-size: 24px; color: #94a3b8; cursor: pointer; padding: 0; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 6px; transition: all 0.2s;">×</button>
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${Object.entries(dayNames).map(([day, name]) => {
                const hours = businessHours[day];
                const isToday = day === today;
                return `
                  <div style="display: flex; justify-content: space-between; padding: 12px; background: ${isToday ? '#eff6ff' : '#f8fafc'}; border-radius: 8px; ${isToday ? 'border: 2px solid #3b82f6;' : 'border: 1px solid #e2e8f0;'}">
                    <span style="font-weight: ${isToday ? '700' : '600'}; color: ${isToday ? '#1e40af' : '#475569'}; font-size: 14px;">${name}</span>
                    <span style="color: ${hours?.enabled ? '#059669' : '#ef4444'}; font-weight: 700; font-size: 14px;">
                      ${hours?.enabled ? `${hours.open} - ${hours.close}` : '휴무'}
                    </span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
        
        modal.onclick = (e) => {
          if (e.target === modal) modal.remove();
        };
        
        document.body.appendChild(modal);
      }

      // 설정 변경 감지 및 페이지 자동 새로고침
      function startSettingsPolling() {
        setInterval(async () => {
          if (currentStoreId && !isLoading) {
            try {
              const newSettings = await loadSettings(currentStoreId);
              // 설정이 변경된 경우 페이지 다시 렌더링
              if (JSON.stringify(newSettings) !== JSON.stringify(settings)) {
                log('INFO', '설정 변경 감지, 페이지 다시 렌더링');
                settings = newSettings;
                renderStorePage();
              }
            } catch (error) {
              log('ERROR', '설정 폴링 실패', error);
            }
          }
        }, 2000); // 2초마다 확인
      }

      // 페이지 로드 시 초기화
      document.addEventListener('DOMContentLoaded', () => {
        initialize().then(() => {
          startSettingsPolling();
        });
      });

      // 모바일 확대/축소 방지
      function preventZoom() {
        let lastTouchEnd = 0;
        
        // 더블탭 확대 방지
        document.addEventListener('touchend', function (event) {
          const now = (new Date()).getTime();
          if (now - lastTouchEnd <= 300) {
            event.preventDefault();
          }
          lastTouchEnd = now;
        }, false);
        
        // 핀치 줌 방지
        document.addEventListener('touchmove', function (event) {
          if (event.scale !== 1) {
            event.preventDefault();
          }
        }, { passive: false });
        
        // 키보드 확대 방지 (Ctrl + +, Ctrl + -)
        document.addEventListener('keydown', function (event) {
          if ((event.ctrlKey || event.metaKey) && (event.keyCode === 61 || event.keyCode === 107 || event.keyCode === 173 || event.keyCode === 109 || event.keyCode === 187 || event.keyCode === 189)) {
            event.preventDefault();
          }
        });
      }

      // 모바일 확대/축소 방지 적용
      preventZoom();

      // 전화하기 함수
      function callStore() {
        if (currentStore && currentStore.phone) {
          window.location.href = `tel:${currentStore.phone}`;
        } else {
          alert('전화번호가 등록되지 않았습니다.');
        }
      }
