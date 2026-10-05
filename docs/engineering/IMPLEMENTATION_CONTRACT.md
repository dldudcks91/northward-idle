# 전체 게임 제작의 모듈 계약

2026-10-05 갱신. 시뮬레이션·화면·아트 작업을 병렬로 진행하기 위한 계약이다. 사용자 핵심 합의는 [현재 기획](../design/GAME_DESIGN.md)을 따른다. 아래 Township 계약은 이번 확장을 위한 실행자 설계이며, 검증 완료 여부는 [진행 상태](../PROJECT_STATUS.md)에 기록한다.

## 영구 마을·성장 확장 계약

`engine.js`는 기존 API와 함께 `createTownState`, `createProgressionState`, `validateExpansionState`, `getTownStats`, `getTownActionAvailability`, `getMasteryInfo`, `getFarmPlots`, `getObjectives`, `getCollectionStats`를 제공한다. 마을은 `town.js`, 농사·마스터리·의뢰·수집은 `progression.js`에서 순수 상태와 공통 논리 시계로 계산한다. 화면은 이 함수가 반환하는 비용·실행 가능 여부·남은 시간을 표시한다.

상태 버전은 3이며 `town`, `progression`, `farm`을 추가한다. `town`에는 자원·주화·시설 단계/상태·주민·마을 숙련·저장 우선순위·자동 보급·다음 생산 시각·건설 예약·시설별 정수 생산 나머지·누계가 있다. `getTownStats`는 전체 창고와 자원별 배분 용량·예약분·생산 중단 이유를 함께 제공한다. `progression`에는 활동별 마스터리·정수 산출 나머지·누적 획득/처치·한 번 받은 의뢰·누계가 있다. `farm`은 각 텃밭의 작물·성장/수확 대기·심은/완료 시각·자동 재파종·예약 산출·횟수와 누계를 보존한다. 이 상태는 JSON으로 왕복할 수 있어야 한다.

기존 저장 검색 키 `northward-idle.save.v2`는 유지한다. v2 검사값을 먼저 검증한 뒤 기존 활동·예약 재료·전투·난수·적용 시각을 그대로 보존하고 새 상태를 저장된 논리 시각에 초기화한다. 마을이 존재하지 않았던 과거 시간의 생산을 소급 지급하지 않는다. 확인 가능한 현재 재고·생산 누계·돌파한 우두머리만 도감으로 옮긴다. 없는 과거 처치 횟수를 만들어내지 않는다. 변환 전에 원본을 별도 보관한다.

새 명령은 `townBuild{buildingId}`, `townCancelBuild`, `townRepair{buildingId}`, `townTrade{tradeId,count}`, `townAutoSupply{enabled,tradeId,targetStock}`, `townPriority{resourceIds}`, `townDonate{resourceId,count}`, `townDiscard{resourceId,count}`, `farmPlant{plotId,cropId,autoReplant}`, `farmHarvest{plotId}`, `farmAutoReplant{plotId,enabled}`, `claimObjective{objectiveId}`다. 전투/회복 중에도 주민 관리·농사·의뢰는 가능하며 주인공의 선택 활동과 보존 전투를 바꾸지 않는다. 실패한 명령은 자원·예약·시간을 변경하지 않는다.

한 시각의 사건은 건설 완료 → 마을 생산/유지/창고/세금/자동 보급 → 농사 성숙/자동 수확 → 회복 완료 → 주인공 공격 → 적 공격 → 직접 활동/탐험 이동 → 자연 회복 → 습격 순으로 처리한다. 자동 보급은 비용을 실제 소비하고 묶음 거래로 최소 목표를 충족하므로 목표보다 최대 2개 많아질 수 있다. 시설 보너스는 전투 시작에 고정하며 진행 중인 전투와 습격으로 보존된 전투에 소급 적용하지 않는다.

복귀 요약은 기존 가방의 `produced/consumed/lost`와 별도로 `town{elapsedMs,produced,consumed,overflow,trades,builds,upgrades,taxes,repairs,ticks}`, `farm{planted,harvested,autoReplanted,produced,consumed}`, `mastery{xp,levels:[{id,from,to}]}`, `objectives{claimed}`를 제공한다. 앱의 `combineSummary`는 지도별 합계·마스터리 단계 전이·의뢰 중복 제거를 보존하며 입력을 변경하지 않는다. 5분씩 계산한 복귀도 한 번에 계산한 복귀와 같아야 한다.

## 제작 범위

첫 지역에서 시작하여 여섯 북방 지역을 순서대로 돌파하고 마지막 위협을 막으면 결말을 확인한다. 결말 이후에도 이전 지역의 반복 탐험과 숙련·수비를 계속할 수 있다. 콘텐츠 이름·수치·이야기·손실·회복은 실행자 결정으로 만든다. 한 번에 한 활동을 선택하며, 습격 시 진행을 보존하고 수비한 뒤 재개한다. 접속 종료 시 미돌파 탐험만 보존하여 멈추고 수비는 계속한다.

## 시뮬레이션 API

`src/simulation/engine.js`는 다음 함수를 내보낸다. DOM·저장소·실제 시각을 읽지 않는다. 시간 단위는 밀리초다.

- `validateContent(data)`: 참조·수치 검증. 실패하면 Error.
- `createGame(data, { seed = 1, now = 0 } = {})`: 직렬화 가능한 새 상태.
- `advanceGame(state, data, elapsedMs, { offline = false } = {})`: 상태를 변경하고 실제 산출·소모·손실·수비·중단 요약을 반환한다. 경과 시간 나누기에 관계없이 동일한 결과.
- `applyCommand(state, data, command)`: 상태 변경 명령. `{ ok, message }` 반환.
- `getDerivedStats(state, data)`: `{ maxHp, attack, defense, attackMs, critChance }`.
- `getSkillLevel(xp)`: 숙련 레벨 계산.

상태의 공통 필드: `schemaVersion: 3`, `time`(논리 경과 ms), `rng`, `regionId`, `unlockedRegions`, `clearedRegions`, `inventory`(ID → 수량), `skills`(ID → `{ xp, level }`), `equipment`(`weapon`, `armor`, `charm` ID 또는 null), `hp`, `activity`(활동이 없으면 null, 있으면 `type`, `id`, `progressMs`, 탐험 `regionId`, `encounters`), `phase`, `battle`(없으면 null), `events`(한정된 `{ id, time, type, text }` 사건 목록), `totals`, `completed`(결말 여부). 실제 엔진은 `nextRaidAt`, `nextHealAt`, `recoveryUntil`, `pendingRaids`, `suspendedBattle`, `lossBudget`, `offlineBlocked`, `autoFood`, `combatStyle`와 사건 순서를 보존한다.

전투 필드: `kind`(`exploration`, `raid`, `boss`), `enemyId`, `enemyHp`, `enemyMaxHp`, 다음 행동 시각, `lastAction`(있으면 `{ id, time, actor: 'player'|'enemy', damage, critical }`). 상태 `phase`는 `idle`, `working`, `exploring`, `defending`, `recovering`을 사용한다.

명령: `{ type: 'gather', id }`, `{ type: 'craft', id, count }`(count 기본 무제한), `{ type: 'explore', regionId }`, `{ type: 'travel', regionId }`, `{ type: 'equip', itemId }`, `{ type: 'stop' }`, `{ type: 'autoFood', value }`, `{ type: 'combatStyle', id }`. 불가능한 명령은 상태를 바꾸지 않고 이유를 반환한다. 수비·회복·전투 중 장비 교체·활동 변경 등 허용 범위는 명확히 제한한다. 가용성 표시용 `getActivityAvailability`와 `getRegionRequirements`도 엔진이 제공한다.

요약 공통 필드: `elapsedMs`, `produced`, `consumed`, `lost`(ID → 수량), `raids`, `defenseWins`, `defenseLosses`, `explorationWins`, `interruptedMs`, `clearedRegions`(배열). 추가 필드는 가능하다.

## 콘텐츠

`data/game.json`의 공통 배열은 `skills`, `items`, `activities`, `recipes`, `regions`, `enemies`, `objectives`이고, `meta`, `settings`와 `town`, `mastery`, `farming` 확장 설정을 포함한다. 각 레코드는 안정적인 `id`와 한국어 `name`을 사용한다.

- items: `kind`(material/food/equipment/trophy/seed), 장비 `slot`, `stats`, `description`.
- activities: `regionId`, `skillId`, `durationMs`, `outputs`(ID → 수량), `description`.
- recipes: `regionId`, `skillId`, `durationMs`, `inputs`, `outputs`, `level`, `description`.
- regions: `index`(0부터), `subtitle`, `description`, `enemyIds`, `bossId`, `foodCost`, `encountersToBoss`, `art`, 진입 조건·이야기 필드는 엔진이 정의하고 전달한다.
- enemies: `maxHp`, `attack`, `defense`, `attackMs`, `art`(bear/wolf/boar/stag/guardian), 전리품.

앱이 JSON을 읽고 검증한 다음 엔진과 화면에 같은 data 객체를 전달한다.

## 화면·앱 경계

UI 소유: `index.html`, `styles.css`, `src/ui/**`. 앱·저장은 root 소유: `src/app/**`, `src/storage/**`, 실행 스크립트 및 통합 검증.

`src/ui/view.js`는 `mountUI({ data, getState, dispatch, actions, assets })`를 내보낸다. 반환값은 `{ render(), showSummary(summary), showError(message), destroy() }`이다. `actions`는 `exportSave()`, `importSave(file)`, `resetGame()`, `setReducedMotion(value)`, `setAutoFood(value)`(엔진 지원 시), `getSettings()` 및 `dismissSummary()`를 제공한다. UI 탭 이동은 게임 명령을 보내지 않는다. 렌더 타이머와 전투 연출은 화면 표시만 담당한다.

앱 진입은 `src/app/main.js`. HTML에서 module script로 불러온다. 설정·가져오기·내보내기·저장 오류·복귀 요약까지 실제 동작을 연결한다. 개발 조작은 `?dev=1`에서만 드러낸다.

## 아트 경계

새 이미지의 대표 role은 hero, bear, wolf, boar, stag(선택), guardian, landscape. `assets/manifest.json`은 `{ assets: [{ id, path, ... }] }` 형식. path는 프로젝트 루트 상대 경로. 앱에서 role → path 매핑을 구성해 UI에 전달한다. 같은 종의 지역 변형은 이미지를 공유할 수 있다.

## 소유 파일

- engine agent: `src/simulation/**`, `data/**`, `tests/engine.test.js` 및 엔진 관련 테스트.
- UI agent: `index.html`, `styles.css`, `src/ui/**`.
- art agent: `assets/**`, `docs/design/ART_DIRECTION.md`.
- root: 앱·저장, 통합·브라우저 테스트, 실행 도구, 프로젝트 문서.
