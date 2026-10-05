# 북방의 마지막 봉화

캐릭터 한 명이 채집·제작·보급으로 성장하고 북방의 여섯 지역을 탐험하는 생존 방치 RPG다. 영구 마을과 텃밭은 주인공이 다른 일을 하는 동안에도 생산한다. 첫 준비부터 마지막 수호자와 결말까지 플레이할 수 있으며, 결말 뒤에도 마을 시설·장기 목표·숙련·수집·반복 탐험·수비가 이어진다. 현재 버전은 1.1.0이며 `northward-idle`은 작업 폴더 이름이다.

## 실행

Windows에서는 **[게임 시작.bat](게임%20시작.bat)**를 실행한다. Python 3.11 이상이 필요하며 게임 자체에는 추가 패키지가 필요 없다. 브라우저가 열리고, 서버 창은 플레이하는 동안 열어둔다.

직접 실행하려면 프로젝트 폴더에서 다음 명령을 사용한다.

```powershell
python scripts/serve.py --open
```

주소는 `http://127.0.0.1:8765`다. 로컬 파일을 더블클릭하는 대신 이 주소로 접속한다. 게임의 콘텐츠와 아트는 모두 이 프로젝트에 있어 외부 API·계정·인터넷 연결이 필요 없다.

## 플레이

첫 지역에서 해송 원목·구리 광석·식재료를 모으고, 판재와 주괴를 가공해 장비를 만든다. 음식과 장비를 준비한 뒤 첫 지역을 돌파하면 다음 지역의 활동이 열린다. 막힌 제작의 재료 이름을 누르면 준비할 채집·가공 활동으로 이동한다. 자세한 흐름은 [플레이 안내](docs/PLAY_GUIDE.md)에 있다.

- 지역 6개, 숙련 7종, 아이템 87종, 채집 18개, 제작법 36개, 적 18종.
- 영구 마을: 시설 12종×6단계, 자원 10종, 주민·생활·가공 생산·세금·창고 배분·수리.
- 교역 18종과 비용을 사용하는 자동 음식 보급, 지역 돌파에 따른 시설·음식 해금.
- 독립 텃밭 4개·작물 6종, 유한 씨앗의 자동 수확·재파종, 의뢰·장기 목표 18개.
- 채집·제작·농사 60개 활동별 마스터리와 실제 획득·처치에 따른 수집 기록.
- 무기·방어구·부적, 균형·강타·수비 태세와 자동 기술.
- 자동전투와 Focus Stop 관전. 화면을 바꿔도 선택한 활동이 계속된다.
- 습격과 자동 수비, 작업·탐험 중단 상태 보존, 패배 뒤 자동 회복.
- 돌파한 지역의 오프라인 반복 탐험. 새로운 지역의 첫 돌파는 접속 중에 진행한다.
- 복귀 시 최대 7일의 실제 계산 결과, 소비·손실·수비·마을·농사·성장 요약.
- 자동 저장·내보내기·가져오기·손상 저장 복구와 중복 창 방지.
- WOS(Whiteout Survival)의 귀여운 입체 캐릭터와 게임 UI를 참고한 새 초상 6종·지역별 북방 배경 6종과 화면.
- 모바일 화면, 키보드 조작, 전투 연출 감소 설정.

이 브라우저의 로컬 저장소에 저장한다. 다른 기기로 옮기거나 브라우저 데이터를 정리하기 전에 설정에서 저장 파일을 내보낸다. 원본을 보존하는 복구 흐름은 [기술 기준](docs/engineering/ARCHITECTURE.md)에 있다.

## 검증

논리 검증은 Node.js의 내장 테스트 러너를 사용한다. 시스템 Node 또는 프로젝트 내부 Playwright 드라이버의 Node를 찾아 실행한다.

```powershell
python scripts/test.py
python scripts/validate_workspace.py
```

실제 브라우저 검증은 선택 의존성 Playwright가 필요하다. 아트 변환에는 Pillow를 사용한다.

```powershell
python -m pip install --target .tools/python -r requirements-dev.txt
python scripts/verify_browser.py
python scripts/verify_visual_redesign.py
python scripts/verify_township.py
```

브라우저 검증 전에 위 로컬 서버와 논리 검증을 실행한다. 설치된 Edge를 사용하며, 동작 검증은 `artifacts/browser/`, 전체 화면은 `artifacts/redesign/`, 마을 검증은 `artifacts/township/`에 결과를 저장한다. 브라우저 검증은 위 순서대로 실행한다. 마을 화면 검증은 논리 검증이 만든 정규 완주 상태를 사용한다. 실제 수행한 범위와 결과는 [진행 상태](docs/PROJECT_STATUS.md)에 기록한다. `?dev=1` 접속에서만 시간 진행 도구가 나타난다. 일반 플레이의 시간은 실제 경과 시간을 따른다.

## 제작 문서

| 문서 | 내용 |
|---|---|
| [현재 기획](docs/design/GAME_DESIGN.md) | 사용자 합의와 실행자가 구체화한 완성 게임 |
| [대화 기록](docs/design/DISCUSSION_LOG.md) | 합의의 근거와 제작 요청 |
| [진행 상태](docs/PROJECT_STATUS.md) | 완성 범위와 실제 검증 결과 |
| [결정 기록](docs/DECISIONS.md) | 콘텐츠·전투·오프라인·저장 선택의 근거 |
| [아트 기준](docs/design/ART_DIRECTION.md) | 화풍, 실제 생성 파일과 검수 |
| [아트·화면 개편 기준](docs/design/VISUAL_REDESIGN.md) | WOS 참고 출처와 전체 교체 기준 |
| [영구 마을·성장 확장](docs/design/TOWNSHIP_EXPANSION.md) | 생산·교역·농사·창고·목표와 실제 검토 결과 |
| [아트 목록과 프롬프트](assets/manifest.json) | 원본·파생본·출처·프롬프트·해시 |
| [기술 기준](docs/engineering/ARCHITECTURE.md) | 상태·시간·저장·화면 분리 |
| [검증 기준](docs/engineering/VALIDATION.md) | 재현 조건과 검증 명령 |
| [AGENTS.md](AGENTS.md) | 이어서 작업할 때 지킬 방향 |

현재 게임은 로컬 단독 플레이 범위다. 여섯 지역은 각자의 배경을 사용하고 같은 종의 적은 초상을 공유한다. 계정·클라우드 저장·외부 공개 호스팅은 포함하지 않는다.
