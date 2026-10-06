const Equipment = require('./models/Equipment')

const samples = [
  ['SAMPLE-MIC-01', 'Compound microscope', 'Microscopy', 'Biology Lab · B-201', 'Observe slides with 40×–1000× magnification and adjustable illumination.', 'Carry with two hands. Clean lenses using lens paper only.'],
  ['SAMPLE-OSC-01', 'Digital oscilloscope', 'Electronics', 'Electronics Lab · E-102', 'Two-channel oscilloscope for analysing waveforms and circuit behaviour.', 'Check probe ratings and grounding with the lab supervisor before use.'],
  ['SAMPLE-CEN-01', 'Bench centrifuge', 'Life sciences', 'Biology Lab · B-201', 'Compact centrifuge for supervised sample preparation.', 'Balance opposing tubes and wait for the rotor to stop before opening.'],
  ['SAMPLE-MUL-01', 'Digital multimeter', 'Electronics', 'Electronics Lab · E-102', 'Measure voltage, current, resistance and continuity for practical work.', 'Select the correct input socket and measurement range.'],
  ['SAMPLE-BAL-01', 'Analytical balance', 'Chemistry', 'Chemistry Lab · C-105', 'Precision balance for weighing small laboratory samples.', 'Keep the weighing pan clean. Close the draft shield before reading.'],
  ['SAMPLE-GEN-01', 'Function generator', 'Electronics', 'Electronics Lab · E-102', 'Generate sine, square and triangle waveforms for circuit testing.', 'Confirm the output amplitude before connecting your circuit.']
]

async function seedSamples() {
  for (const [assetCode, name, category, location, description, instructions] of samples) {
    await Equipment.updateOne({ assetCode }, {
      $setOnInsert: { assetCode, name, category, location, description, instructions, sample: true, status: 'available', revision: 0, bookings: [] }
    }, { upsert: true })
  }
}

module.exports = { seedSamples }

if (require.main === module) {
  const mongoose = require('mongoose')
  const fs = require('node:fs')
  const path = require('node:path')
  const env = path.join(__dirname, '.env')
  if (fs.existsSync(env)) process.loadEnvFile(env)
  mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/lab_tracker')
    .then(async () => { await Equipment.init(); await seedSamples(); console.log('Six labelled sample assets are ready. Existing items were not changed.') })
    .catch(error => { console.error(error.message); process.exitCode = 1 })
    .finally(() => mongoose.disconnect())
}
