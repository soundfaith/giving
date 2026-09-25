import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const exteriorDir = 'C:\\Users\\Public\\project\\church_images\\exterior'
const interiorDir = 'C:\\Users\\Public\\project\\church_images\\interior'

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
}

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
const projects = [
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666',
]

async function listFiles(directory: string) {
  return (await fs.readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(directory, entry.name))
}

const exterior = await listFiles(exteriorDir)
const interior = await listFiles(interiorDir)
if (exterior.length < 3 || interior.length < 6) throw new Error('Not enough church image assets were found.')

for (let index = 0; index < projects.length; index += 1) {
  const projectId = projects[index]
  const imageFiles = [exterior[index], interior[index * 2], interior[index * 2 + 1]]
  const imageUrls: string[] = []
  for (let imageIndex = 0; imageIndex < imageFiles.length; imageIndex += 1) {
    const source = imageFiles[imageIndex]
    const objectPath = `${projectId}/${imageIndex}-${path.basename(source)}`
    const { error } = await supabase.storage.from('project-photos').upload(objectPath, await fs.readFile(source), { upsert: true, contentType: 'image/jpeg' })
    if (error) throw error
    imageUrls.push(`${supabaseUrl}/storage/v1/object/public/project-photos/${objectPath}`)
  }
  const { error } = await supabase.from('projects').update({ image_urls: imageUrls }).eq('id', projectId)
  if (error) throw error
  console.log(`Updated ${projectId} with ${imageUrls.length} images`)
}
