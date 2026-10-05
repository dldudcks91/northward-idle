# 북방 생존 게임 아트 기준

2026-10-05 갱신. 사용자가 모든 아트를 더 귀여운 Whiteout Survival(WOS)풍으로 교체하도록 요청했다. 현재 버전은 부드러운 3D 겨울 게임 일러스트 **v2**이며, 초상 6개와 여섯 지역의 독립 풍경 6개를 실제 생성해 적용 경로를 갱신했다. 이후 영구 마을 시스템 요청에 맞춰 봉화마을 풍경 한 장을 추가했다. 구도·수량·색상·파생 크기는 요청을 구체화한 실행자 결정이다.

## 현재 화풍과 참고 역할

WOS 공식 영웅 Jessie·Sergey·Molly 초상과 공식 스토어 이미지를 실제로 열어 확인했다. 핵심은 둥근 얼굴과 몸, 큰 맑은 눈, 부드러운 입체 음영, 파란 겨울옷, 크림 모피, 따뜻한 주황빛이다. 각진 검은 윤곽과 면 음영을 사용하던 v1의 화풍은 현재 게임에서 교체했다.

새 주인공은 짧은 갈색 웨이브 머리, 파란 니트 모자, 큰 호박색 눈, 크림 모피와 주황 목도리로 설계한 새로운 여행자다. WOS의 특정 얼굴·머리·의상·투구·고유 장치·로고를 복사하지 않았다. 곰은 둥근 귀와 넓은 주둥이, 늑대는 뾰족한 귀와 회색 털, 멧돼지는 넓은 코와 작은 어금니, 사슴은 큰 귀와 가지 뿔로 구별한다. 동물형은 실제 종의 특징을 귀여운 비율로 단순화하고 인간형 몸이나 의상을 붙이지 않았다. 수호자는 둥근 청회색 돌, 눈이 쌓인 왕관, 큰 청록색 눈으로 표현한다.

주인공·곰 생성은 Jessie·Molly의 렌더링만 참조했다. 뒤의 네 초상은 새 주인공·곰을 재질·비율·조명의 참조로 사용해 한 세트의 일관성을 유지했다. 각 에셋의 입력과 이 간접 참조 관계를 manifest에 기록했다. 지역 풍경은 WOS의 실제 탐험 전투 화면과 Jessie 초상을 환경 재질·읽기 쉬운 공간·둥근 3D의 참고로 사용했다. 기존 화면의 인물·UI·장면·글자를 새 배경에 복사하지 않았다.

실제 출처 URL과 용도는 [참고 이미지 출처](../../artifacts/reference/wos/sources.json)와 [현재 manifest](../../assets/manifest.json)에 보존했다. 대표 원문은 [WOS 공식 영웅 안내](https://www.whiteoutsurvival.wiki/heroes/)와 [공식 Google Play 페이지](https://play.google.com/store/apps/details?id=com.gof.global&hl=en)다. 참고 이미지 자체는 게임용 assets에 포함하지 않는다.

## 현재 파일

| 논리 ID | 역할 | 게임용 파일 | 크기 | 투명 |
|---|---|---|---|---|
| hero | 북방 여행자 | [hero.webp](../../assets/images/v2/hero.webp) | 512×512 | 예 |
| bear | 갈색 곰 | [bear.webp](../../assets/images/v2/bear.webp) | 512×512 | 예 |
| wolf | 회색 늑대 | [wolf.webp](../../assets/images/v2/wolf.webp) | 512×512 | 예 |
| boar | 야생 멧돼지 | [boar.webp](../../assets/images/v2/boar.webp) | 512×512 | 예 |
| stag | 뿔이 있는 사슴 | [stag.webp](../../assets/images/v2/stag.webp) | 512×512 | 예 |
| guardian | 석상 수호자 | [guardian.webp](../../assets/images/v2/guardian.webp) | 512×512 | 예 |
| region-rime-shore | 눈 해안·청록 바다·등대 | [region-rime-shore.webp](../../assets/images/v2/region-rime-shore.webp) | 1599×900 | 아니오 |
| region-pinewood | 침엽수·숲길·등불 | [region-pinewood.webp](../../assets/images/v2/region-pinewood.webp) | 1599×900 | 아니오 |
| region-frozen-lake | 푸른 얼음 호수 | [region-frozen-lake.webp](../../assets/images/v2/region-frozen-lake.webp) | 1599×900 | 아니오 |
| region-black-bog | 눈 이탄 섬·물길·갈대 | [region-black-bog.webp](../../assets/images/v2/region-black-bog.webp) | 1599×900 | 아니오 |
| region-knife-mountains | 높은 산맥·눈 고갯길 | [region-knife-mountains.webp](../../assets/images/v2/region-knife-mountains.webp) | 1599×900 | 아니오 |
| region-aurora-ruins | 둥근 돌 유적·북극광·여섯 봉화 | [region-aurora-ruins.webp](../../assets/images/v2/region-aurora-ruins.webp) | 1599×900 | 아니오 |
| town-village | 영구 봉화마을·여러 시설·넓은 눈길 | [town-village.webp](../../assets/images/township/town-village.webp) | 1599×900 | 아니오 |

기존 `landscape` ID는 `region-rime-shore`와 같은 파일을 가리키는 alias다. 따라서 manifest에는 14개 논리 레코드가 있고, 실제 고유 표시 파일은 13개다. 중복 경로를 제외한 게임용 파일 용량은 **2,137,972바이트**다. 기존 v2의 12개 고유 표시 파일은 1,807,644바이트이며 내용과 해시를 유지했다.

원본 PNG 12개는 `assets/source/v2/<ID>.png`, 표시 파일은 `assets/images/v2/<ID>.webp`에 보존한다. [초상 생성 기록](../../assets/generated-portraits-v2.json)과 [풍경 생성 기록](../../assets/generated-environments-v2.json)에 실제 프롬프트 전문·도구 기본 저장 원본·입력 역할이 있다. manifest는 안정적인 ID, 버전, 경로, 원본과 파생 크기·해시·용량·알파·직접/간접 참고 URL을 제공한다.

생성 도구는 built-in `image_gen.imagegen`이다. 초상·풍경 하나마다 독립 호출을 수행했으며, 생성된 원본은 도구 기본 폴더와 workspace에 모두 남겼다. [export_art.py](../../assets/export_art.py)는 v2와 추가 township 기록을 읽어 원본 복사와 LANCZOS 축소, WebP 인코딩을 수행한다. 초상 RGB quality 96, 풍경 quality 89이며 초상의 알파 값은 축소 후 인코딩 전후에 정확하게 보존되는지 비교한다. 원본·출력의 해시와 프롬프트가 현재 manifest와 같으면 기존 파일과 레코드를 그대로 사용한다. `--partial`은 준비된 파일을 내보내되 현재 manifest를 교체하지 않는다. 완전한 13개가 없으면 전체 export는 오류를 반환하며 v1은 재생성하지 않는다.

## 영구 봉화마을 추가

2026-10-05에 built-in 생성 도구 한 번으로 새 조감 풍경을 만들었다. 기존 해안·북극광 유적 표시본을 부드러운 3D 재질·파란 눈 그림자·따뜻한 빛의 참조로만 사용했고 새 장면을 구성했다. 중앙의 작은 봉화와 원형 광장, 창고·작업장/대장간·주택·온실·시장·벌목장·요리 시설이 분리되어 보인다. 하단 중앙에는 넓은 눈길을 남겼다. 글자·UI·버튼·인물·동물은 그리지 않았다. 시설의 보유·레벨·생산 상태는 실제 코드가 표시하며 배경은 분위기와 공간만 제공한다.

원본 [town-village.png](../../assets/source/township/town-village.png)는 1672×941 RGB PNG, 표시본은 1599×900 RGB WebP와 330,328바이트다. [생성 기록](../../assets/generated-township.json)에 실제 프롬프트 전문, 도구 기본 원본 경로, 참조 역할·계보·해시를 남겼다. 새 레코드를 더하기 전 [v2 manifest 사본](../../assets/archive/v2-before-township/manifest.json)을 보존했다.

[마을 검수 시트](../../assets/preview-township.png)를 실제 열어 800px·384px에서 확인했다. 작은 화면에서도 봉화·온실·시장·벌목장 형태가 구별되며 기존 설원 배경과 재질·색상이 맞는다. 원본/표시 크기·RGB 모드·SHA-256·용량을 검사했고, 기존 13개 논리 레코드 전체와 그 원본/표시 해시가 사본과 동일함을 검증했다. 전체 exporter 실행과 Python 컴파일도 통과했다. 이어 전체/부분 export를 다시 실행해 13개 표시 파일이 재작성되지 않고 manifest 바이트가 그대로인 것을 확인했다. 실제 마을 UI에 버튼이 배치된 상태의 가독성은 브라우저 통합 검증에서 별도로 확인한다.

## 실제 수행한 검수

- 주인공·곰을 먼저 실제 이미지로 확인한 뒤 동일한 부드러운 3D 방향으로 네 초상을 완성했다.
- 초상 원본 6개 모두 알파 최소 0, 최대 255이고 완전 투명 픽셀 비율은 27.7~43.7%다. 각 WebP를 다시 열어 512×512와 RGBA를 확인하고 축소한 PNG의 알파 바이트와 출력의 알파 바이트가 같은지 검사했다.
- [초상 검수 시트](../../assets/preview-v2-portraits.png)에서 320px·160px·48px을 실제로 확인했다. 파란 겨울옷, 곰의 둥근 귀, 늑대의 뾰족한 귀, 멧돼지 코와 어금니, 사슴 뿔, 수호자 왕관이 구별되며 눈과 부드러운 입체감이 유지된다.
- [털 가장자리 검수](../../assets/preview-v2-edge-colors.png)에서 곰·늑대·멧돼지를 청강색·크림·밝은 청색 위에 각각 320px·160px·48px로 합성해 확인했다. 렌더의 가는 푸른 역광과 밝은 털은 남지만, 표시 크기에서 눈에 띄는 흰 후광이나 사각 배경은 없다. 원본과 표시 에셋은 이 검수 중 수정하지 않았다.
- [풍경 검수 시트](../../assets/preview-v2-environments.png)에서 여섯 지역을 함께 확인했다. 해안·숲·호수·습지·산맥·유적이 다른 지형으로 읽히고, 밝은 푸른 눈과 호박빛 재질이 통일된다. 중앙 공간을 비웠고 인물·동물·글자·UI가 없다.
- 모든 원본과 파생의 SHA-256, 13개 ID와 12개 고유 경로, alias, 실제 파일 용량 합계를 검사했다. 기존 v1 표시 파일 7개도 보존된 manifest 해시와 다시 대조해 변경하지 않았음을 확인했다.

이 기록은 에셋과 합성 크기 검수다. 실제 브라우저의 새로운 배치·전투·반응형 표시는 UI 통합 검증 결과를 따른다.

## 이전 버전 보존

v1 원본과 표시 파일은 `assets/source/`, `assets/images/`의 기존 경로에 그대로 남겼다. 이전 manifest·생성 원본 경로 기록·exporter·아트 기준 사본은 `assets/archive/v1/`에 보관한다. [v1 manifest](../../assets/archive/v1/manifest.json)가 교체 전 게임용 에셋을 기록한다. v1은 TheSevenSimulationRPG의 짙은 윤곽·각진 면 음영을 참고해 만들었고, 현재 제작 기준은 위의 WOS풍 v2다.
