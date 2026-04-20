# 네오우드솔루션 Cloudflare Pages + Supabase 완성 패키지

## 파일 구성
- `index.html` : 고객 배포용 계산기
- `internal.html` : 실무용 관리자 페이지
- `admin.html` : 관리자 분석 대시보드
- `public-app.js` : 고객용 로직
- `internal.js` : 실무용 로직
- `admin.js` : 관리자 대시보드 로직
- `styles.css` : 공통 스타일
- `functions/api/log.js` : 고객 이벤트 저장 API
- `functions/api/admin.js` : 관리자 집계 API
- `supabase/schema.sql` : Supabase 테이블 생성 SQL

## Supabase에서 이미 한 일
- `schema.sql` 실행 완료
- Secret key 생성 완료
- Project URL 확보 완료

## Cloudflare Pages에 넣어야 하는 환경변수
- `SUPABASE_URL` = Supabase Project URL
- `SUPABASE_SECRET_KEY` = 방금 만든 Secret key
- `ADMIN_DASHBOARD_TOKEN` = 네가 직접 정하는 관리자 비밀번호

## Cloudflare Pages 배포 순서
1. 이 폴더 전체를 GitHub 저장소에 업로드
2. Cloudflare Pages에서 GitHub 저장소 연결
3. Build command는 비워두기
4. Build output directory도 비워두기
5. 환경변수 3개 추가
6. 다시 배포

## 배포 후 주소
- `/` : 고객 배포용
- `/internal.html` : 실무용
- `/admin.html` : 관리자 대시보드

## 관리자 대시보드 접속 방법
1. `admin.html` 열기
2. `ADMIN_DASHBOARD_TOKEN` 값 입력
3. 조회 기간 선택
4. 대시보드 불러오기

## 주의
- Secret key는 브라우저 HTML에 넣지 말 것
- Secret key는 Cloudflare 환경변수에만 넣을 것
- GitHub에도 Secret key를 파일로 올리지 말 것
