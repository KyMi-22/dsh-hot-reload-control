const puppeteer = require('puppeteer')

const url = process.argv[2]
const out = process.argv[3] || 'ui.png'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function clickText(page, selector, text) {
  return page.evaluate((selector, text) => {
    const target = [...document.querySelectorAll(selector)].find((node) => (node.textContent || '').includes(text))
    if (!target) return false
    target.click()
    return true
  }, selector, text)
}

;(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.DSH_EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    args: ['--no-sandbox'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  page.on('console', (message) => console.log('console:', message.type(), message.text()))
  page.on('pageerror', (error) => console.log('pageerror:', error.message))
  page.on('response', async (response) => {
    if (!response.url().includes('dsh-hot-reload-control/api')) return
    let body = ''
    try { body = await response.text() } catch {}
    console.log('api response:', response.status(), body)
  })

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(4500)
  await clickText(page, 'button', '继续')
  await sleep(700)
  await page.evaluate(() => {
    const target = [...document.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === '关闭')
    target?.click()
  })
  await sleep(700)
  await page.evaluate(() => {
    const target = [...document.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === '账号菜单')
    target?.click()
  })
  await sleep(500)
  await clickText(page, 'button', '设置')
  await sleep(1500)
  await page.click('button[aria-label="更多操作"]')
  await sleep(400)

  // Defer the click so evaluate returns before navigation starts.
  const clicked = await page.evaluate(() => {
    const target = [...document.querySelectorAll('button[role="menuitem"]')].find((node) => (node.textContent || '').includes('热重载'))
    if (!target) return false
    window.setTimeout(() => target.click(), 0)
    return true
  })
  console.log('hot reload menu item clicked:', clicked)
  await sleep(7000)
  await page.screenshot({ path: out.replace('.png', '-after.png'), fullPage: true })
  const after = await page.evaluate(() => document.body.innerText)
  console.log('after reload body:', after.slice(0, 800))

  // Re-open settings on the reloaded page to confirm the plugin survived.
  await page.evaluate(() => {
    const target = [...document.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === '账号菜单')
    target?.click()
  })
  await sleep(500)
  await clickText(page, 'button', '设置')
  await sleep(1500)
  const settings = await page.evaluate(() => document.body.innerText)
  console.log('plugin present after reload:', settings.includes('热重载'))
  await page.screenshot({ path: out.replace('.png', '-settings-after.png'), fullPage: true })
  await browser.close()
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
