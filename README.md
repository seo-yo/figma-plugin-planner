# Plan Doc Builder (MLB Planner Tools)

기획자용 Figma 플러그인. 퍼블리싱 요소 표 / 랜딩 URL 표 / 버튼 마커를 일괄 생성한다.

## 구성

| 파일 | 설명 |
|------|------|
| `manifest.json` | Figma 플러그인 매니페스트 |
| `code.js` | 플러그인 메인 로직 (샌드박스) |
| `ui.html` | 플러그인 UI |

## 설치 (개발 모드)

1. Figma → **Plugins → Development → Import plugin from manifest…**
2. 이 저장소의 `manifest.json` 선택
3. **Plugins → Development → Plan Doc Builder** 로 실행

## 기능

- 퍼블 요소 표 생성 (`#no.n`, `#content.n`, `#url.n`)
- 랜딩 URL 표 생성
- 버튼 마커 일괄 생성
