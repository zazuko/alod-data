const p = require('barnard59')
const path = require('path')

// Get number of days in a month
function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

// Proper date (range) parsing function
function parseDate(dateString) {
  const datePattern = /(^|-|(?<=-))(?:(?:(\d{4})(?:|\.(\d{2})(?:|\.(\d{2})))(?:|\s(\(ca\.\))))|(s\.d\.\s\(sine dato\))|(k\.A\.|keine\sAngabe))(-|$)/g

  let result, match, matchCount = 0, index = 0
  while (match = datePattern.exec(dateString)) {
    if (index != match.index) { return }
    matchCount++

    const [whole, prefix, year, month, date, isCirca, isSineDato, isNotSpecified, suffix] = match
    const parsed = {}
    if (year) {
      parsed.year = +year
      if (month) {
        if (month < 1 || 12 < month) { return }
        parsed.month = +month
        if (date) {
          if (date < 1 || getDaysInMonth(parsed.year, parsed.month - 1) < date) { return }
          parsed.date = +date
        }
      }
      if (isCirca) { parsed.isCirca = true }
    } else if (isSineDato) { parsed.isSineDato = true }
    else if (isNotSpecified) { parsed.isNotSpecified = true }
    else { return }

    if (matchCount === 1 && prefix === '' && suffix === '') { result = parsed }
    else if (matchCount === 1 && prefix === '' && suffix === '-') { result = { start: parsed } }
    else if (matchCount === 1 && prefix === '-' && suffix === '') { result = { end: parsed } }
    else if (matchCount === 2 && prefix === '' && suffix === '') { result.end = parsed }
    else { return }

    index = match.index + whole.length
  }
  if (index != dateString.length) { return }

  return result
}

// Named RDF nodes
const nodes = {
  hasMember: p.rdf.namedNode('http://www.ica.org/standards/RiC/ontology#hasMember'),
  intervalStarts: p.rdf.namedNode('http://www.w3.org/2006/time#intervalStarts'),
  intervalStartsCirca: p.rdf.namedNode('http://data.alod.ch/alod/time/intervalStartsCirca'),
  intervalStartsValid: p.rdf.namedNode('http://data.alod.ch/alod/time/hiddenIntervalStarts'),
  intervalEnds: p.rdf.namedNode('http://www.w3.org/2006/time#intervalEnds'),
  intervalEndsCirca: p.rdf.namedNode('http://data.alod.ch/alod/time/intervalEndsCirca'),
  intervalEndsValid: p.rdf.namedNode('http://data.alod.ch/alod/time/hiddenIntervalEnds'),
  type: p.rdf.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
  sineDato: p.rdf.namedNode('http://data.alod.ch/alod/time/SineDato'),
  notSpecified: p.rdf.namedNode('http://data.alod.ch/alod/time/NotSpecified')
}

// Levels
const levelReplacements = new Map([
  ['http://data.alod.ch/alod/level/Archiv',         'http://data.alod.ch/alod/level/archive'],
  ['http://data.alod.ch/alod/level/Hauptabteilung', 'http://data.alod.ch/alod/level/department'],
  ['http://data.alod.ch/alod/level/Bestand',        'http://data.alod.ch/alod/level/fond'],
  ['http://data.alod.ch/alod/level/Teilbestand',    'http://data.alod.ch/alod/level/subfond'],
  ['http://data.alod.ch/alod/level/Serie',          'http://data.alod.ch/alod/level/series'],
  ['http://data.alod.ch/alod/level/Dossier',        'http://data.alod.ch/alod/level/file'],
  ['http://data.alod.ch/alod/level/Subdossier',     'http://data.alod.ch/alod/level/subfile'],
  ['http://data.alod.ch/alod/level/Dokument',       'http://data.alod.ch/alod/level/item']
])
const validLevels = [...levelReplacements.values()]

function convertCsvw (filename) {
  const filenameInput = 'input/' + filename
  const filenameMetadata = filenameInput + '-metadata.json'
  const filenameOutput = 'target/' + path.basename(filename, '.csv') + '.nt'

  return p.rdf.dataset().import(p.file.read(filenameMetadata).pipe(p.jsonld.parse())).then((metadata) => {
    return p.run(p.file.read(filenameInput)
      .pipe(p.csvw.parse({
        baseIRI: 'file://' + filename,
        metadata: metadata
      }))
      .pipe(p.map((quad) => {
        const subject = quad.subject
        const predicate = quad.predicate
        const object = quad.object
        let quads = []

        // Flip relationship from relation, object becomes subject
        if (predicate.value === 'http://example.org/relation') {
          quads.push(p.rdf.quad(object, nodes.hasMember, subject))
        }

        // Proper date (range) parsing
        if (predicate.value === 'http://data.alod.ch/alod/legacyTimeRange') {
          const dateString = object.value.trim()
          const parsedDate = parseDate(dateString)

          if (parsedDate) {
            function pad(number, length) { return String(number).padStart(length, '0') }
            (function addQuads(date, isStart, isEnd) {
              if (date.start || date.end) { // recursive calls
                if (date.start) { addQuads(date.start, true, false) }
                if (date.end) { addQuads(date.end, false, true) }

              } else if (date.year) { // quad generation for (partial) dates
                let object, objectValidStart, objectValidEnd
                if (date.month) {
                  if (date.date) {
                    object = objectValidStart = objectValidEnd = p.rdf.literal(`${pad(date.year, 4)}-${pad(date.month, 2)}-${pad(date.date, 2)}`, 'http://www.w3.org/2001/XMLSchema#date')
                  } else {
                    object = p.rdf.literal(`${pad(date.year, 4)}-${pad(date.month, 2)}`, 'http://www.w3.org/2001/XMLSchema#gYearMonth')
                    objectValidStart = p.rdf.literal(`${pad(date.year, 4)}-${pad(date.month, 2)}-01`, 'http://www.w3.org/2001/XMLSchema#date')
                    objectValidEnd = p.rdf.literal(`${pad(date.year, 4)}-${pad(date.month, 2)}-${pad(getDaysInMonth(date.year, date.month - 1), 2)}`, 'http://www.w3.org/2001/XMLSchema#date')
                  }
                } else {
                  object = p.rdf.literal(pad(date.year, 4), 'http://www.w3.org/2001/XMLSchema#gYear')
                  objectValidStart = p.rdf.literal(`${pad(date.year, 4)}-01-01`, 'http://www.w3.org/2001/XMLSchema#date')
                  objectValidEnd = p.rdf.literal(`${pad(date.year, 4)}-12-31`, 'http://www.w3.org/2001/XMLSchema#date')
                }

                if (isStart) {
                  quads.push(p.rdf.quad(subject, nodes[`intervalStarts${date.isCirca ? 'Circa' : ''}`], object))
                  quads.push(p.rdf.quad(subject, nodes['intervalStartsValid'], objectValidStart))
                }
                if (isEnd) {
                  quads.push(p.rdf.quad(subject, nodes[`intervalEnds${date.isCirca ? 'Circa' : ''}`], object))
                  quads.push(p.rdf.quad(subject, nodes['intervalEndsValid'], objectValidEnd))
                }

              } else if (date.isSineDato) { //quad generation for special values
                quads.push(p.rdf.quad(subject, nodes.type, nodes.sineDato))
              } else if (date.isNotSpecified) {
                quads.push(p.rdf.quad(subject, nodes.type, nodes.notSpecified))
              }
            })(parsedDate, true, true)

          } else {
            console.log(`Unparsed date: ${dateString}`)
          }
        }

        // Proper level names
        if (predicate.value === 'http://data.archiveshub.ac.uk/def/level' && !validLevels.includes(object.value)) {
          if (levelReplacements.has(object.value)) {
            object.value = levelReplacements.get(object.value)
          } else {
            console.log(`Unrecognized level: ${object.value}`)
          }
        }

        quads.push(p.rdf.quad(subject, predicate, object))
        return quads
      }))
      .pipe(p.flatten())
      .pipe(p.ntriples.serialize())
      .pipe(p.file.write(filenameOutput)))
  })
}

const filenames = [
  'OLR-2018-02-16.tab'
]

p.run(() => {
  p.shell.mkdir('-p', 'target/')
}).then(() => {
  return p.Promise.serially(filenames, (filename) => {
    console.log('convert: ' + filename)

    return convertCsvw(filename)
  })
}).then(() => {
  console.log('done')
}).catch((err) => {
  console.error(err.stack)
})
