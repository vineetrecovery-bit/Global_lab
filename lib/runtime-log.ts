type RuntimeLogLevel = 'info' | 'warn' | 'error'

type RuntimeLogValue = string | number | boolean | null | string[]

export function runtimeLog(
  event: string,
  details: Record<string, RuntimeLogValue>,
  level: RuntimeLogLevel = 'info'
) {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...details,
  })

  if (level === 'error') {
    console.error(line)
    return
  }

  if (level === 'warn') {
    console.warn(line)
    return
  }

  console.log(line)
}
