# 외부 라이브러리와 샘플 에셋

실행 패키지의 정확한 버전과 의존 관계는 package-lock.json에 있습니다. 아래 프로젝트의 저작권과 라이선스 고지를 유지합니다.

- Three.js: MIT, https://github.com/mrdoob/three.js/blob/dev/LICENSE
- Socket.IO / socket.io-client: MIT, https://github.com/socketio/socket.io/blob/main/LICENSE
- Vite: MIT, https://github.com/vitejs/vite/blob/main/LICENSE
- TypeScript: Apache-2.0, https://github.com/microsoft/TypeScript/blob/main/LICENSE.txt
- tsx: MIT, https://github.com/privatenumber/tsx/blob/master/LICENSE

`apps/client/public/assets/models/tree-demo.glb`는 이 프로젝트의 `scripts/create-demo-tree.mjs`가 기본 geometry로 생성한 샘플입니다. 생성 코드를 함께 보관합니다. 외부 모델·음원은 확보 시 개별 출처와 이용조건을 추가합니다.

2026.11.04 적용한 `apps/client/public/assets/models/blender/*.glb`는 Blender 4.5.15 LTS에서 이 프로젝트의 `scripts/build_blender_assets.py`로 제작한 모델입니다. 편집 원본은 `asset-sources/blender/maeum-garden.blend`이며 별도의 외부 모델·텍스처를 가져오지 않았습니다. Blender 프로그램 자체의 이용조건은 [공식 라이선스 안내](https://www.blender.org/about/license/)를 참조합니다.
