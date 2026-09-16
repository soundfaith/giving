import process from 'node:process'

const endpoint = process.env.TX_RATE_URL
const secret = process.env.TX_RATE_CRON_SECRET

if (!endpoint || !secret) throw new Error('TX_RATE_URL and TX_RATE_CRON_SECRET are required')

const response = await fetch(endpoint, {
  method: 'POST',
  headers: { 'x-cron-secret': secret },
})
const body = await response.text()

if (!response.ok) throw new Error(`${response.status}: ${body}`)
console.log(new Date().toISOString(), body)