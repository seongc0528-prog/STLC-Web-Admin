// 교회는 시드니에 있으므로 날짜는 관리자 브라우저가 아니라 시드니 기준으로 다룬다.
export const CHURCH_TIME_ZONE = 'Australia/Sydney'

const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: CHURCH_TIME_ZONE })

/** timestamptz → 시드니 기준 'YYYY-MM-DD' */
export function toChurchDate(timestamp: string) {
  return ymd.format(new Date(timestamp))
}

/**
 * 'YYYY-MM-DD' → 그날 시드니 오전 10시 timestamptz.
 * STLC_Web의 scripts/fix-sermon-dates.mjs와 같은 값을 쓴다.
 */
export function churchDateToTimestamp(date: string) {
  return `${date}T10:00:00+10:00`
}

/**
 * 새 설교·주보의 기본 날짜. 월~수에 올리면 지난 주일, 목~토에 올리면 다가오는
 * 주일로 본다. 입력칸에서 언제든 바꿀 수 있다.
 */
export function nearestSunday() {
  const today = ymd.format(new Date())
  const d = new Date(`${today}T00:00:00Z`)
  const dow = d.getUTCDay()
  d.setUTCDate(d.getUTCDate() + (dow <= 3 ? -dow : 7 - dow))
  return d.toISOString().slice(0, 10)
}
