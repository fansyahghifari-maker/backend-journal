const generateInvoiceNumber = () => {
  const d = new Date()
  const date = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`
  const rand = Math.random().toString(36).substring(2,8).toUpperCase()
  return `CJ-${date}-${rand}`
}
module.exports = { generateInvoiceNumber }
