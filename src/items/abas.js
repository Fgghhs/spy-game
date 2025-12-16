const fs = require('fs');
const items = require('./itemlist.json');

const updatedItems = items.map(item => ({
  ...item,
  image: `${item.name}.png`
}));

fs.writeFileSync('./itemlist_updated.json', JSON.stringify(updatedItems, null, 2));