const p = require('barnard59')
const path = require('path')
const moment = require('moment')

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

        if (predicate.value === 'http://data.alod.ch/alod/legacyTimeRange') {
          const dateString = object.value.trim()

          /*
            startsWith('-') -> nur intervalEnds
            endsWith('-') -> nur intervalStarts
            '-' in Mitte: -> split, danach einzeln verarbeiten

          */

          // regex patterns
          const gYear = /^\d{4}$/ // 2018
          const gYearMonth = /^(\d{4}\.\d{2})$/ // 2010.09
          const date = /^(\d{4}\.\d{2}\.\d{2})$/ // 2010.09.13
          const gYear2gYear = /^(\d{4})\s*-\s*(\d{4})$/ // 2011-2019
          const date2date = /^(\d{4}\.\d{2}\.\d{2})\s*-\s*(\d{4}\.\d{2}\.\d{2})$/ // 2010.09.13-2011.03.14
          const gYearMonth2gYearMonth = /^(\d{4}\.\d{2})\s*-\s*(\d{4}\.\d{2})$/ // 1985.11-1986.04

          let found = []

          if (gYear.test(dateString)) {
            found = dateString.match(gYear)
            quads.push(p.rdf.quad(subject, p.rdf.namedNode('http://www.w3.org/2006/time#intervalStarts'), p.rdf.literal(found[0], 'http://www.w3.org/2001/XMLSchema#gYear')))
          } else if (gYear2gYear.test(dateString)) {
            found = dateString.match(gYear2gYear)
            quads.push(
              p.rdf.quad(subject, p.rdf.namedNode('http://www.w3.org/2006/time#intervalStarts'), p.rdf.literal(found[1], 'http://www.w3.org/2001/XMLSchema#gYear')),
              p.rdf.quad(subject, p.rdf.namedNode('http://www.w3.org/2006/time#intervalEnds'), p.rdf.literal(found[2], 'http://www.w3.org/2001/XMLSchema#gYear'))
            )
          } else if (date2date.test(dateString)) {
            found = dateString.match(date2date)
            quads.push(
              p.rdf.quad(subject, p.rdf.namedNode('http://www.w3.org/2006/time#intervalStarts'), p.rdf.literal(moment(found[1], 'YYYY.MM.DD').format('YYYY-MM-DD'), 'http://www.w3.org/2001/XMLSchema#date')),
              p.rdf.quad(subject, p.rdf.namedNode('http://www.w3.org/2006/time#intervalEnds'), p.rdf.literal(moment(found[2], 'YYYY.MM.DD').format('YYYY-MM-DD'), 'http://www.w3.org/2001/XMLSchema#date'))
            )
          } else if (gYearMonth2gYearMonth.test(dateString)) {
            found = dateString.match(gYearMonth2gYearMonth)
            quads.push(
              p.rdf.quad(subject, p.rdf.namedNode('http://www.w3.org/2006/time#intervalStarts'), p.rdf.literal(moment(found[1], 'YYYY.MM').format('YYYY-MM'), 'http://www.w3.org/2001/XMLSchema#gYearMonth')),
              p.rdf.quad(subject, p.rdf.namedNode('http://www.w3.org/2006/time#intervalEnds'), p.rdf.literal(moment(found[2], 'YYYY.MM').format('YYYY-MM'), 'http://www.w3.org/2001/XMLSchema#gYearMonth'))
            )
          } else if (date.test(dateString)) {
            quads.push(
              p.rdf.quad(subject, p.rdf.namedNode('http://www.w3.org/2006/time#intervalStarts'), p.rdf.literal(moment(dateString, 'YYYY.MM.DD').format('YYYY-MM-DD'), 'http://www.w3.org/2001/XMLSchema#date'))
            )
          } else if (gYearMonth.test(dateString)) {
            quads.push(
              p.rdf.quad(subject, p.rdf.namedNode('http://www.w3.org/2006/time#intervalStarts'), p.rdf.literal(moment(dateString, 'YYYY.MM').format('YYYY-MM'), 'http://www.w3.org/2001/XMLSchema#gYearMonth'))
            )
          } else if (dateString.startsWith('s.d.')) {
            // s.d. (sine dato)
          } else if (dateString.startsWith('keine Angabe')) {
            // keine Angabe
          } else {
            console.log('Unparsed date: ' + dateString)
          }
        }

        if (quads.length === 0) {
          quads.push(p.rdf.quad(subject, predicate, object))
        }

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
