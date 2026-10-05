# 참고 자료의 범위

## Melvor Idle 조사 사본

`melvoridle/`의 00–11 문서는 기존 TheSevenSimulationRPG 저장소의 `docs/reference/melvoridle/`에서 2026-10-04 가져온 조사 사본이다. 조사 시점·출처·미확인 표기를 유지한다. 현재 최신 게임 상태를 새로 검증한 자료는 아니다.

먼저 [종합](melvoridle/11_synthesis.md)을 읽고, 필요에 따라 [진행 흐름](melvoridle/07_progression.md), [경제](melvoridle/08_economy.md), [화면과 세션](melvoridle/09_screen_session.md), [전투](melvoridle/05_combat.md)로 내려간다.

사본에 등장하는 ‘본작’, 파티·로스터, 기존 데이터·설계 경로는 원래 TheSevenSimulationRPG와 비교한 설명이다. Northward Idle의 규칙이 아니다. 특히 숙련 개수와 동시에 실행하는 활동 개수는 구분해야 한다. 조사 문서의 검색 합성·해석·미확인 정보는 구현 전 필요한 부분을 원문으로 검증한다.

포함하지 않은 원래 저장소의 상대 링크는 라벨과 원본 경로를 평문으로 남겼다. 내부 조사 문서 링크와 외부 출처는 유지했다. 원문 내용의 사실·수치·판단을 수정한 것은 아니다.

## Focus Stop 참고

기존 저장소의 `src/ui/battle.js`에서 `FOCUS_MODES`와 Stop 처리, `docs/client/SCREEN_DESIGN.md`에서 전투 화면 설명을 참조했다. 코드와 에셋 자체는 이 프로젝트에 복사하지 않았다. 필요하면 같은 부모 폴더의 `thesevensimulationrpg`를 읽기 전용 참고 대상으로 조사할 수 있다.

확인한 특징은 행동자 강조, 앞으로 나감, 짧은 멈춤, 타격과 효과, 복귀다. 기존 코드는 관전 중 Stop 시간 때문에 실제 진행이 느려질 수 있다. 신작의 시간 규칙은 [기술 기준](../engineering/ARCHITECTURE.md)에 따라 관전과 비관전이 일치하도록 구현한다. 기존 전투 공식·파티 구성·기술 스택 전체를 가져오기로 정한 것은 아니다.
