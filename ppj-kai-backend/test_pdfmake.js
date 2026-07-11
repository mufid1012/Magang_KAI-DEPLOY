const pdfmake = require('pdfmake');
pdfmake.fonts = {
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique'
  }
};
const docDefinition = {
  defaultStyle: { font: 'Helvetica' },
  content: ['Hello']
};
async function run() {
  try {
    const doc = pdfmake.createPdf(docDefinition);
    const buffer = await doc.getBuffer();
    console.log('Success, buffer length:', buffer.length);
  } catch (e) {
    console.error(e);
  }
}
run();
