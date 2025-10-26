# 📝 가게 설정 로그 개선

**작성일**: 2025-10-26  
**버전**: v1.3.1  
**상태**: ✅ 완료

---

## 🎯 개선 목표

**사용자 피드백**:
> "가게 설정도 뭘 했는지 명확히 표시 할 수 있도록 변경해줘"

**문제점**:
```
[설정 저장] 2025-10-26 18:22:46
가게 설정을 저장했습니다.
settings: basic,discount,delivery,pickup,images,qrCode,sectionOrder
```
→ 무엇이 변경되었는지 불명확

---

## ✅ 개선 사항

### **Before ❌**

```
[설정 저장] 2025-10-26 18:22:46
가게 설정을 저장했습니다.
settings: basic,discount,delivery,pickup,images,qrCode,sectionOrder
```

**문제점**:
- 어떤 설정이 변경되었는지 불명확
- `basic`, `discount` 같은 키 이름만 표시
- 변경 전/후 비교 없음

---

### **After ✅**

```
[가게 설정 변경] 2025-10-26 18:22:46
'미친제육' 가게 설정이 변경되었습니다.

변경 항목:
• 할인 설정: 활성화
• 픽업 안내: 내용 수정
• 배달앱 설정: 배달의민족, 쿠팡이츠 변경
• UI 순서: 순서 변경

details:
  changedSettings: ["discount", "pickup", "delivery", "sectionOrder"]
  changes: ["할인 설정: 활성화", "픽업 안내: 내용 수정", ...]
  before: { discount: {...}, pickup: {...}, ... }
  after: { discount: {...}, pickup: {...}, ... }
```

**개선점**:
- ✅ 가게 이름 명시
- ✅ 변경 항목을 한글로 명확히 표시
- ✅ 활성화/비활성화, 내용 수정, 순서 변경 등 구체적 변경 내용
- ✅ 변경 전/후 전체 데이터 포함

---

## 🔧 구현 내용

### **1. 변경 전 설정 저장**

```python
# 변경 전 설정 저장 (활동 로그용)
old_settings = {}
if store_id in store_data['settings']:
    import copy
    old_settings = copy.deepcopy(store_data['settings'][store_id])
```

---

### **2. 설정 타입별 한글 이름 매핑**

```python
setting_names = {
    'basic': '기본 정보',
    'discount': '할인 설정',
    'delivery': '배달앱 설정',
    'pickup': '픽업 안내',
    'images': '이미지 관리',
    'qrCode': 'QR 코드',
    'sectionOrder': 'UI 순서'
}
```

---

### **3. 설정 타입별 세부 변경 내용 추적**

#### **할인 설정**
```python
if setting_type == 'discount':
    if old_value.get('enabled') != new_value.get('enabled'):
        changes.append(f"{setting_name}: {'활성화' if new_value.get('enabled') else '비활성화'}")
    elif old_value.get('title') != new_value.get('title') or old_value.get('description') != new_value.get('description'):
        changes.append(f"{setting_name}: 내용 수정")
```

**예시**:
- `할인 설정: 활성화`
- `할인 설정: 비활성화`
- `할인 설정: 내용 수정`

---

#### **픽업 안내**
```python
elif setting_type == 'pickup':
    if old_value.get('enabled') != new_value.get('enabled'):
        changes.append(f"{setting_name}: {'활성화' if new_value.get('enabled') else '비활성화'}")
    elif old_value.get('title') != new_value.get('title') or old_value.get('description') != new_value.get('description'):
        changes.append(f"{setting_name}: 내용 수정")
```

**예시**:
- `픽업 안내: 활성화`
- `픽업 안내: 비활성화`
- `픽업 안내: 내용 수정`

---

#### **배달앱 설정**
```python
elif setting_type == 'delivery':
    # 배달앱 URL 변경 확인
    changed_apps = []
    for app in ['ttaengUrl', 'baeminUrl', 'coupangUrl', 'yogiyoUrl']:
        if old_value.get(app) != new_value.get(app):
            app_names = {'ttaengUrl': '땡겨요', 'baeminUrl': '배달의민족', 'coupangUrl': '쿠팡이츠', 'yogiyoUrl': '요기요'}
            changed_apps.append(app_names.get(app, app))
    if changed_apps:
        changes.append(f"{setting_name}: {', '.join(changed_apps)} 변경")
    elif old_value.get('deliveryOrder') != new_value.get('deliveryOrder'):
        changes.append(f"{setting_name}: 순서 변경")
```

**예시**:
- `배달앱 설정: 배달의민족, 쿠팡이츠 변경`
- `배달앱 설정: 순서 변경`

---

#### **UI 순서**
```python
elif setting_type == 'sectionOrder':
    changes.append(f"{setting_name}: 순서 변경")
```

**예시**:
- `UI 순서: 순서 변경`

---

### **4. 로그 설명 생성**

```python
# 로그 설명 생성
if changes:
    description = f"'{store_name}' 가게 설정이 변경되었습니다.\n\n변경 항목:\n" + "\n".join(f"• {change}" for change in changes)
else:
    description = f"'{store_name}' 가게 설정이 저장되었습니다."
```

---

### **5. 활동 로그 기록**

```python
self.log_activity(
    log_type="settings",
    action="가게 설정 변경",
    description=description,
    user_id="admin",
    user_name="관리자",
    target_type="store",
    target_id=store_id,
    target_name=store_name,
    details={
        "changedSettings": list(data.keys()),
        "changes": changes,
        "before": old_settings,
        "after": new_settings
    }
)
```

---

## 📊 예시

### **예시 1: 할인 설정 활성화**

```
[가게 설정 변경] 2025-10-26 18:30:00
'미친제육' 가게 설정이 변경되었습니다.

변경 항목:
• 할인 설정: 활성화

details:
  changedSettings: ["discount"]
  changes: ["할인 설정: 활성화"]
  before: { discount: { enabled: false, title: "", description: "" } }
  after: { discount: { enabled: true, title: "포장 시 2,000원 할인", description: "..." } }
```

---

### **예시 2: 배달앱 URL 변경**

```
[가게 설정 변경] 2025-10-26 18:31:00
'미친제육' 가게 설정이 변경되었습니다.

변경 항목:
• 배달앱 설정: 배달의민족, 쿠팡이츠 변경

details:
  changedSettings: ["delivery"]
  changes: ["배달앱 설정: 배달의민족, 쿠팡이츠 변경"]
  before: { delivery: { baeminUrl: "", coupangUrl: "" } }
  after: { delivery: { baeminUrl: "https://...", coupangUrl: "https://..." } }
```

---

### **예시 3: 여러 설정 동시 변경**

```
[가게 설정 변경] 2025-10-26 18:32:00
'미친제육' 가게 설정이 변경되었습니다.

변경 항목:
• 할인 설정: 내용 수정
• 픽업 안내: 활성화
• 배달앱 설정: 순서 변경
• UI 순서: 순서 변경

details:
  changedSettings: ["discount", "pickup", "delivery", "sectionOrder"]
  changes: ["할인 설정: 내용 수정", "픽업 안내: 활성화", ...]
  before: { ... }
  after: { ... }
```

---

## 🎯 핵심 개선 사항 요약

| 항목 | Before ❌ | After ✅ |
|------|----------|---------|
| **가게 이름** | 없음 | 명시 |
| **설정 이름** | `discount`, `pickup` | `할인 설정`, `픽업 안내` |
| **변경 내용** | 불명확 | `활성화`, `내용 수정`, `순서 변경` 등 구체적 |
| **변경 전/후** | 없음 | `before`, `after` 포함 |

---

## ✅ 검증

### **테스트 시나리오**

1. **할인 설정 활성화** → "할인 설정: 활성화"
2. **픽업 안내 내용 수정** → "픽업 안내: 내용 수정"
3. **배달앱 URL 변경** → "배달앱 설정: 배달의민족, 쿠팡이츠 변경"
4. **UI 순서 변경** → "UI 순서: 순서 변경"

---

## 🎉 결론

**가게 설정 로그 완벽 개선!**

- ✅ 가게 이름 명시
- ✅ 한글로 명확한 설정 이름
- ✅ 구체적인 변경 내용 (활성화/비활성화, 내용 수정, 순서 변경)
- ✅ 변경 전/후 전체 데이터 포함

**이제 무엇이 변경되었는지 한눈에 파악 가능!** 📝✨

---

**마지막 업데이트**: 2025-10-26 19:00  
**작성자**: AI Assistant  
**상태**: ✅ 완료

