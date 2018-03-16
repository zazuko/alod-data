const p = require('barnard59')
const path = require('path')

function parseDate(dateString) {
  const datePattern = /(^|-|(?<=-))(?:(?:(\d{4})(?:|\.(\d{2})(?:|\.(\d{2})))(?:|\s(\(ca\.\))))|(s\.d\.\s\(sine dato\)|k\.A\.|keine\sAngabe))(-|$)/g

  let result, match, matchCount = 0, index = 0
  while (match = datePattern.exec(dateString)) {
    if (index != match.index) { return }
    matchCount++

    const [whole, prefix, year, month, date, isApproximate, isMissing, suffix] = match
    const parsed = {}
    if (year) {
      parsed.year = +year
      if (month) {
        if (month < 1 || 12 < month) { return }
        parsed.month = +month
        if (date) {
          const daysInMonth = new Date(parsed.year, parsed.month, 0).getDate()
          if (date < 1 || daysInMonth < date) { return }
          parsed.date = +date
        }
      }
      if (isApproximate) { parsed.isApproximate = true }
    } else if (isMissing) { parsed.isMissing = true }
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
          quads.push(
            p.rdf.quad(object, p.rdf.namedNode('http://www.ica.org/standards/RiC/ontology#hasMember'), subject)
          )
        }

        if (predicate.value === 'http://data.alod.ch/alod/legacyTimeRange') {
          const dateString = object.value.trim()
          const parsedDate = parseDate(dateString)

          if (parsedDate) {
            function fmt(number, length) { return String(number).padStart(length, '0') }
            (function addQuads(date, isEnd = false) {
              if (date.start) { addQuads(date.start) }
              if (date.end) { addQuads(date.end, true) }
              if (date.isMissing) {
                //TODO: TBD
              }
              if (date.year) {
                const predicate = p.rdf.namedNode(`http://www.w3.org/2006/time#interval${isEnd ? 'Ends' : 'Starts'}`)
                let object
                if (date.month) {
                  if (date.date) { object = p.rdf.literal(`${fmt(date.year, 4)}-${fmt(date.month, 2)}-${fmt(date.date, 2)}`, 'http://www.w3.org/2001/XMLSchema#date') }
                  else { object = p.rdf.literal(`${fmt(date.year, 4)}-${fmt(date.month, 2)}`, 'http://www.w3.org/2001/XMLSchema#gYearMonth') }
                } else { object = p.rdf.literal(fmt(date.year, 4), 'http://www.w3.org/2001/XMLSchema#gYear') }
                quads.push(p.rdf.quad(subject, predicate, object))
                if (date.isApproximate) {
                  //TODO: TBD
                }
              }
            })(parsedDate)
          } else {
            console.log('Unparsed date: ' + dateString)
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
