require('dotenv').config()

const fs = require('fs')
const path = require('path')
const jwt = require('jsonwebtoken')
const WebSocket = require('ws')
const pool = require('../src/db/pool')

const devtoolsBase = process.env.CHROME_DEVTOOLS_URL || 'http://127.0.0.1:9222'
const appUrl = process.env.UI_SMOKE_APP_URL || 'http://localhost:3000'
const userId = Number(process.env.UI_SMOKE_USER_ID || 3)
const outputDir = path.join(__dirname, '../.codex-test-output')
const debugPath = path.join(outputDir, 'ui-smoke-debug.log')
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
const debug = (message) => fs.appendFileSync(debugPath, `${new Date().toISOString()} ${message}\n`)
let activeSocket = null

async function connect() {
  debug('Fetching Chrome target list')
  const pages = await fetch(`${devtoolsBase}/json/list`).then((response) => response.json())
  const page = pages.find((entry) => entry.type === 'page')
  if (!page?.webSocketDebuggerUrl) throw new Error('No Chrome DevTools page is available.')

  const socket = new WebSocket(page.webSocketDebuggerUrl)
  const pending = new Map()
  const browserErrors = []
  let messageId = 0

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Chrome DevTools WebSocket connection timed out.')), 10_000)
    socket.once('open', () => {
      clearTimeout(timer)
      resolve()
    })
    socket.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
  debug('Chrome WebSocket opened')

  socket.on('message', (data) => {
    const message = JSON.parse(data.toString('utf8'))
    if (message.id && pending.has(message.id)) {
      const { resolve, reject, timer } = pending.get(message.id)
      pending.delete(message.id)
      clearTimeout(timer)
      if (message.error) reject(new Error(message.error.message))
      else resolve(message.result || {})
      return
    }
    if (message.method === 'Runtime.exceptionThrown') {
      browserErrors.push(message.params?.exceptionDetails?.text || 'Unhandled browser exception')
    }
    if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') {
      browserErrors.push(message.params.entry.text)
    }
  })

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++messageId
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`Chrome DevTools timed out while running ${method}.`))
    }, 10_000)
    pending.set(id, { resolve, reject, timer })
    socket.send(JSON.stringify({ id, method, params }))
  })

  return { socket, send, browserErrors }
}

async function main() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required for the authenticated visual check.')
  fs.mkdirSync(outputDir, { recursive: true })
  fs.writeFileSync(debugPath, '')
  debug('UI smoke test started')

  const user = (await pool.query(
    'SELECT id, email, name, department, designation, role, is_active FROM users WHERE id = $1',
    [userId]
  )).rows[0]
  if (!user?.is_active) throw new Error(`Active UI smoke-test user ${userId} was not found.`)
  debug('Database user loaded')

  const token = jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '5m', issuer: 'wce-prof-insights' }
  )
  const session = { token, user: {
    id: user.id,
    email: user.email,
    name: user.name,
    department: user.department,
    designation: user.designation,
    role: user.role
  } }

  const { socket, send, browserErrors } = await connect()
  activeSocket = socket
  await send('Page.enable')
  debug('Page domain enabled')
  await send('Runtime.enable')
  await send('Log.enable')

  const setViewport = async (width, height, mobile = false) => {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile,
      screenWidth: width,
      screenHeight: height
    })
  }
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Browser evaluation failed.')
    return result.result?.value
  }
  const navigate = async (url = appUrl) => {
    await send('Page.navigate', { url })
    await delay(1800)
  }
  const capture = async (fileName) => {
    const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })
    const filePath = path.join(outputDir, fileName)
    fs.writeFileSync(filePath, Buffer.from(shot.data, 'base64'))
    return filePath
  }

  await setViewport(1440, 1000)
  await navigate()
  debug('Login page navigated')
  const loginState = await evaluate(`({
    title: document.title,
    heading: document.querySelector('h1')?.textContent?.trim(),
    hasEmail: Boolean(document.querySelector('input[type="email"]')),
    hasPassword: Boolean(document.querySelector('input[type="password"]')),
    bodyText: document.body?.innerText?.slice(0, 300),
    rootChildren: document.querySelector('#root')?.children?.length,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
  })`)
  const loginScreenshot = await capture('ui-login-desktop.png')
  debug('Login screenshot captured')
  if (!loginState.hasEmail || !loginState.hasPassword || loginState.horizontalOverflow) {
    throw new Error(`Login layout assertion failed: ${JSON.stringify({ ...loginState, browserErrors })}`)
  }

  await evaluate(`localStorage.setItem('wce_prof_insights_session_v2', ${JSON.stringify(JSON.stringify(session))}); location.reload(); true`)
  await delay(2500)
  debug('Authenticated dashboard reloaded')
  const dashboardState = await evaluate(`({
    hasDashboard: Boolean(document.querySelector('.dashboard-page')),
    heading: document.querySelector('.dashboard-page h1')?.textContent?.trim(),
    stats: document.querySelectorAll('.dashboard-stats article').length,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
  })`)
  if (!dashboardState.hasDashboard || dashboardState.stats !== 4 || dashboardState.horizontalOverflow) {
    throw new Error(`Dashboard layout assertion failed: ${JSON.stringify(dashboardState)}`)
  }
  const dashboardScreenshot = await capture('ui-dashboard-desktop.png')
  debug('Dashboard screenshot captured')

  await evaluate(`[...document.querySelectorAll('.desktop-nav button')].find((button) => button.textContent.includes('New Activity'))?.click(); true`)
  await delay(800)
  const formState = await evaluate(`({
    hasForm: Boolean(document.querySelector('.activity-form-page')),
    steps: document.querySelectorAll('.stepper li').length,
    heading: document.querySelector('h1')?.textContent?.trim(),
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
  })`)
  if (!formState.hasForm || formState.horizontalOverflow) throw new Error(`Activity form assertion failed: ${JSON.stringify(formState)}`)
  const formDesktopScreenshot = await capture('ui-activity-form-desktop.png')
  debug('Desktop form screenshot captured')

  await setViewport(390, 844, true)
  await delay(500)
  const mobileState = await evaluate(`({
    menuVisible: getComputedStyle(document.querySelector('.mobile-menu-button')).display !== 'none',
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    viewport: [window.innerWidth, window.innerHeight]
  })`)
  if (!mobileState.menuVisible || mobileState.horizontalOverflow) {
    throw new Error(`Mobile layout assertion failed: ${JSON.stringify(mobileState)}`)
  }
  const formMobileScreenshot = await capture('ui-activity-form-mobile.png')
  debug('Mobile form screenshot captured')

  if (browserErrors.length) throw new Error(`Browser console errors: ${browserErrors.join(' | ')}`)

  console.log(JSON.stringify({
    loginState,
    dashboardState,
    formState,
    mobileState,
    screenshots: [loginScreenshot, dashboardScreenshot, formDesktopScreenshot, formMobileScreenshot]
  }))
  socket.close()
  activeSocket = null
}

main()
  .catch((error) => {
    console.error(`UI visual smoke test failed: ${error.message}`)
    process.exitCode = 1
  })
  .finally(async () => {
    activeSocket?.terminate()
    await pool.end()
  })
