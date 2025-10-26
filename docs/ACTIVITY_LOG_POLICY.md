# 📝 활동 로그 정책 및 가이드

**작성일**: 2025-10-26  
**버전**: v1.0  
**상태**: ✅ 필수 준수 사항

---

## 🎯 기본 원칙

### **모든 데이터 변경 작업은 활동 로그에 기록되어야 합니다!**

이는 다음을 위해 필수적입니다:
- 📊 **추적성**: 누가, 언제, 무엇을 변경했는지 추적
- 🔍 **디버깅**: 문제 발생 시 원인 파악
- 📈 **분석**: 사용 패턴 및 통계 분석
- 🔐 **보안**: 비정상적인 활동 감지
- 📜 **감사**: 규정 준수 및 감사 대응

---

## 📋 활동 로그 필수 기록 대상

### ✅ 반드시 기록해야 하는 작업

#### 1. **가게 관리**
- [x] 가게 생성
- [x] 가게 정보 수정 (이름, 전화번호, 주소)
- [x] 가게 삭제
- [x] 가게 선택/전환
- [x] 가게 일시정지
- [x] 가게 재개

#### 2. **설정 관리**
- [x] 배달앱 URL 설정/수정
- [x] 배달앱 순서 변경
- [x] 할인 설정 활성화/비활성화
- [x] 할인 내용 수정
- [x] 픽업 안내 활성화/비활성화
- [x] 픽업 내용 수정
- [x] UI 섹션 순서 변경

#### 3. **이미지 관리**
- [x] 로고 이미지 업로드
- [x] 메뉴 이미지 업로드
- [x] 이미지 삭제

#### 4. **QR 코드 관리**
- [x] QR 코드 생성
- [x] QR 코드 재생성
- [x] QR 코드 다운로드
- [x] QR 코드 삭제

#### 5. **슈퍼어드민**
- [x] 슈퍼어드민 로그인
- [x] 슈퍼어드민 정보 수정

---

## 📊 활동 로그 데이터 구조

### 기본 구조
```json
{
  "id": "uuid",
  "timestamp": "2025-10-26T15:45:00.123456",
  "type": "store|settings|image|qr|admin",
  "action": "생성|수정|삭제|업로드|다운로드|활성화|비활성화",
  "description": "상세 설명 (변경 전/후 포함)",
  "userId": "admin",
  "userName": "관리자",
  "targetType": "store|setting|image|qr",
  "targetId": "store_xxx|setting_xxx",
  "targetName": "가게명|설정명",
  "details": {
    "oldValue": "변경 전 값",
    "newValue": "변경 후 값",
    "additionalInfo": {}
  }
}
```

### 필수 필드
- `type`: 활동 유형
- `action`: 수행한 작업
- `description`: 사람이 읽을 수 있는 설명
- `timestamp`: 발생 시각

### 권장 필드
- `details.oldValue`: 변경 전 값
- `details.newValue`: 변경 후 값
- `targetId`: 대상 객체 ID
- `targetName`: 대상 객체 이름

---

## 🔍 활동 로그 상세 작성 가이드

### 1. **가게 생성**
```javascript
await logActivity('store', '가게 생성', 
  `새로운 가게 '${storeName}'을 생성했습니다.`, {
    storeId: newStore.id,
    storeName: storeName,
    phone: phone,
    address: address,
    createdAt: newStore.createdAt
});
```

### 2. **가게 정보 수정**
```javascript
await logActivity('store', '가게 정보 수정', 
  `'${storeName}' 가게의 기본 정보를 수정했습니다.\n변경 항목: ${changedFields.join(', ')}`, {
    storeId: storeId,
    storeName: storeName,
    changes: {
      name: { old: oldName, new: newName },
      phone: { old: oldPhone, new: newPhone },
      address: { old: oldAddress, new: newAddress }
    }
});
```

### 3. **배달앱 URL 설정**
```javascript
await logActivity('settings', '배달앱 URL 설정', 
  `${appName} URL을 ${url ? '설정' : '제거'}했습니다.\n이전: ${oldUrl || '없음'}\n이후: ${url || '없음'}`, {
    storeId: storeId,
    appName: appName,
    oldUrl: oldUrl,
    newUrl: url
});
```

### 4. **배달앱 순서 변경**
```javascript
await logActivity('settings', '배달앱 순서 변경', 
  `배달앱 표시 순서 변경\n이전: ${oldOrderNames}\n이후: ${newOrderNames}`, {
    storeId: storeId,
    oldOrder: oldOrder,
    newOrder: newOrder,
    oldOrderNames: oldOrderNames,
    newOrderNames: newOrderNames
});
```

### 5. **할인 설정**
```javascript
await logActivity('settings', '할인 설정 변경', 
  `할인 설정을 ${enabled ? '활성화' : '비활성화'}했습니다.\n제목: ${title}\n내용: ${description}`, {
    storeId: storeId,
    enabled: enabled,
    title: title,
    description: description,
    oldEnabled: oldEnabled
});
```

### 6. **픽업 안내 설정**
```javascript
await logActivity('settings', '픽업 안내 변경', 
  `픽업 안내를 ${enabled ? '활성화' : '비활성화'}했습니다.\n제목: ${title}\n내용: ${description}`, {
    storeId: storeId,
    enabled: enabled,
    title: title,
    description: description,
    oldEnabled: oldEnabled
});
```

### 7. **UI 섹션 순서 변경**
```javascript
await logActivity('settings', 'UI 순서 변경', 
  `가게 페이지 섹션 순서 변경\n이전: ${oldOrderTitles}\n이후: ${newOrderTitles}`, {
    storeId: storeId,
    oldOrder: oldSectionOrder.map(s => s.id),
    newOrder: sectionOrder.map(s => s.id),
    oldOrderTitles: oldOrderTitles,
    newOrderTitles: newOrderTitles
});
```

### 8. **이미지 업로드**
```javascript
await logActivity('image', '이미지 업로드', 
  `${imageType === 'mainLogo' ? '메인 로고' : '메뉴 이미지'}를 업로드했습니다.\n파일명: ${filename}\n크기: ${fileSize}`, {
    storeId: storeId,
    imageType: imageType,
    filename: filename,
    fileSize: fileSize,
    uploadPath: uploadPath
});
```

### 9. **QR 코드 생성**
```javascript
await logActivity('qr', 'QR 코드 생성', 
  `QR 코드가 생성되었습니다. (가게별 고유 URL 포함)\n대상 URL: ${targetUrl}\n로고 포함: ${hasLogo ? '예' : '아니오'}`, {
    storeId: storeId,
    qrCodeUrl: qrCodeUrl,
    targetUrl: targetUrl,
    hasLogo: hasLogo,
    logoPath: logoPath
});
```

### 10. **QR 코드 삭제**
```javascript
await logActivity('qr', 'QR 코드 삭제', 
  `QR 코드가 삭제되었습니다.\n파일: ${filename}`, {
    storeId: storeId,
    deletedFile: filename,
    deletedAt: new Date().toISOString()
});
```

---

## 🚀 백엔드 활동 로그 구현

### Python 서버에서 활동 로그 기록

```python
def log_activity(self, log_type, action, description, user_id="admin", 
                 user_name="관리자", target_type=None, target_id=None, 
                 target_name=None, details=None):
    """
    활동 로그 기록
    
    Args:
        log_type: 활동 유형 (store, settings, image, qr, admin)
        action: 수행한 작업
        description: 상세 설명
        user_id: 사용자 ID
        user_name: 사용자 이름
        target_type: 대상 유형
        target_id: 대상 ID
        target_name: 대상 이름
        details: 추가 상세 정보
    """
    try:
        data = self.load_data()
        
        if 'activityLogs' not in data:
            data['activityLogs'] = []
        
        new_log = {
            "id": str(uuid.uuid4()),
            "timestamp": datetime.now().isoformat(),
            "type": log_type,
            "action": action,
            "description": description,
            "userId": user_id,
            "userName": user_name,
            "targetType": target_type,
            "targetId": target_id,
            "targetName": target_name,
            "details": details or {}
        }
        
        data['activityLogs'].insert(0, new_log)
        
        # 최대 1000개까지만 유지
        if len(data['activityLogs']) > 1000:
            data['activityLogs'] = data['activityLogs'][:1000]
        
        self.save_data(data)
        log(LogLevel.INFO, f"활동 로그 기록: {log_type} - {action}")
        
    except Exception as e:
        log_error(f"활동 로그 기록 실패: {log_type} - {action}", e)
```

---

## 📱 프론트엔드 활동 로그 구현

### JavaScript에서 활동 로그 기록

```javascript
async function logActivity(type, action, description, details = {}) {
    const logData = {
        type: type,
        action: action,
        description: description,
        userId: 'admin',
        userName: '관리자',
        timestamp: new Date().toISOString(),
        details: details
    };
    
    try {
        await apiRequest('/api/activity-logs', 'POST', logData);
    } catch (error) {
        console.error('활동 로그 기록 실패:', error);
        
        // 폴백: localStorage에 저장
        const localLogs = JSON.parse(localStorage.getItem('activityLogs') || '[]');
        localLogs.unshift(logData);
        localStorage.setItem('activityLogs', JSON.stringify(localLogs.slice(0, 100)));
    }
}
```

---

## ✅ 체크리스트: 새 기능 구현 시

### 백엔드 API 구현 시
- [ ] API 엔드포인트에 `self.log_activity()` 호출 추가
- [ ] 변경 전/후 값을 `details`에 포함
- [ ] `target_id`, `target_name` 명시
- [ ] 성공 시에만 로그 기록

### 프론트엔드 기능 구현 시
- [ ] 사용자 액션 후 `logActivity()` 호출
- [ ] 상세한 `description` 작성 (변경 전/후 포함)
- [ ] `details` 객체에 관련 정보 포함
- [ ] 에러 발생 시에도 로그 기록 (실패 로그)

---

## 🔍 활동 로그 검증

### 로그가 제대로 기록되었는지 확인

```bash
# 최근 활동 로그 확인
curl http://localhost:8081/api/activity-logs | jq '.logs[:5]'

# 특정 타입 로그 확인
curl http://localhost:8081/api/activity-logs | jq '.logs[] | select(.type=="qr")'

# 특정 액션 로그 확인
curl http://localhost:8081/api/activity-logs | jq '.logs[] | select(.action=="QR 코드 생성")'
```

---

## 📊 활동 로그 예시

### 좋은 예시 ✅

```json
{
  "id": "abc123",
  "timestamp": "2025-10-26T15:45:00.123456",
  "type": "settings",
  "action": "배달앱 순서 변경",
  "description": "배달앱 표시 순서 변경\n이전: 땡겨요 → 배달의민족 → 쿠팡이츠 → 요기요\n이후: 배달의민족 → 땡겨요 → 요기요 → 쿠팡이츠",
  "userId": "admin",
  "userName": "관리자",
  "targetType": "setting",
  "targetId": "store_123",
  "targetName": "미친제육",
  "details": {
    "oldOrder": ["ttaeng", "baemin", "coupang", "yogiyo"],
    "newOrder": ["baemin", "ttaeng", "yogiyo", "coupang"],
    "oldOrderNames": "땡겨요 → 배달의민족 → 쿠팡이츠 → 요기요",
    "newOrderNames": "배달의민족 → 땡겨요 → 요기요 → 쿠팡이츠"
  }
}
```

### 나쁜 예시 ❌

```json
{
  "type": "settings",
  "action": "변경",
  "description": "설정 변경됨"
}
```

**문제점**:
- 변경 전/후 값 없음
- 무엇이 변경되었는지 불명확
- `details` 없음
- `targetId`, `targetName` 없음

---

## 🎯 활동 로그 작성 원칙

### 1. **명확성**
- 무엇이 변경되었는지 명확하게
- 변경 전/후 값 포함

### 2. **완전성**
- 모든 관련 정보 포함
- `details` 객체 활용

### 3. **일관성**
- 동일한 형식 유지
- 동일한 용어 사용

### 4. **추적성**
- `targetId`로 대상 추적 가능
- `timestamp`로 시간 추적 가능

---

## 🚨 주의사항

### 절대 빠뜨리면 안 되는 것

1. **데이터 변경 작업**: 모든 CRUD 작업
2. **설정 변경**: 모든 설정 수정
3. **파일 업로드/삭제**: 모든 파일 작업
4. **중요한 액션**: QR 생성/삭제 등

### 로그 기록 시점

- ✅ **성공 후**: 작업이 성공적으로 완료된 후
- ✅ **실패 시**: 실패한 경우에도 기록 (실패 로그)
- ❌ **작업 전**: 작업 전에는 기록하지 않음

---

## 📈 활동 로그 활용

### 1. **디버깅**
```javascript
// 특정 가게의 최근 활동 확인
const logs = activityLogs.filter(log => log.targetId === storeId);
```

### 2. **통계**
```javascript
// 가장 많이 사용되는 기능
const actionCounts = {};
activityLogs.forEach(log => {
    actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;
});
```

### 3. **감사**
```javascript
// 특정 기간의 모든 변경 사항
const changes = activityLogs.filter(log => 
    new Date(log.timestamp) >= startDate && 
    new Date(log.timestamp) <= endDate
);
```

---

## 🎉 결론

**활동 로그는 선택이 아닌 필수입니다!**

모든 새로운 기능 구현 시:
1. ✅ 활동 로그 기록 추가
2. ✅ 변경 전/후 값 포함
3. ✅ 상세한 설명 작성
4. ✅ `details` 객체 활용

**이 정책을 준수하면 시스템의 투명성과 추적성이 크게 향상됩니다!**

---

**마지막 업데이트**: 2025-10-26  
**다음 업데이트**: 활동 로그 분석 대시보드 추가 예정

