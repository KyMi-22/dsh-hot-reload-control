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
  await sleep(800)
  await page.evaluate(() => {
    const target = [...document.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === '关闭')
    target?.click()
  })
  await sleep(800)
  await page.evaluate(() => {
    const target = [...document.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === '账号菜单')
    target?.click()
  })
  await sleep(500)
  await clickText(page, 'button', '设置')
  await sleep(1500)

  // Open the dropdown.
  await page.click('button[aria-label="更多操作"]')
  await sleep(500)
  await page.screenshot({ path: out.replace('.png', '-menu.png'), fullPage: true })
  const menuText = await page.evaluate(() => document.body.innerText)
  console.log('menu open:', menuText.includes('重启应用'))

  // Restart is unavailable in this CLI Host; this exercises the error path.
  await clickText(page, 'button[role="menuitem"]', '重启应用')
  await sleep(1200)
  await page.screenshot({ path: out.replace('.png', '-restart-error.png'), fullPage: true })
  const errorText = await page.evaluate(() => document.body.innerText)
  console.log('restart error shown:', errorText.includes('当前运行环境不支持一键重启'))

  // Close the notice and run the real hot reload.
  await page.evaluate(() => {
    const target = [...document.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === '关闭提示')
    target?.click()
  })
  await page.click('button[aria-label="更多操作"]')
  await sleep(400)
  const navigation = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null)
  await clickText(page, 'button[role="menuitem"]', '热重载')
  await sleep(800)
  await page.screenshot({ path: out.replace('.png', '-reloading.png'), fullPage: true })
  await navigation
  await sleep(3500)
  await page.screenshot({ path: out.replace('.png', '-after-reload.png'), fullPage: true })
  const after = await page.evaluate(() => document.body.innerText)
  console.log('after reload body:', after.slice(0, 1200))
  await browser.close()
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
