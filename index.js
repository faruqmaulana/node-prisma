const express = require('express');
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const { parseString } = require('xml2js');
const { Builder } = require('xml2js');
const ExcelJS = require('exceljs');

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

app.use(express.json()); // For parsing application/json

// Function to check if product exists based on title and other unique properties
async function productExists(title, categoryId) {
  const product = await prisma.product.findFirst({
    where: {
      title: title,
      category_id: categoryId,
    },
  });
  return product !== null;
}

// Route to fetch data from API and save to local database
app.get('/fetch-data/:id', async (req, res) => {
  const id = req.params.id;
  const apiURL = `https://portal.panelo.co/paneloresto/api/productlist/${id}`;

  try {
    const response = await axios.get(apiURL);

    const categories = response.data.products;

    for (let category of categories) {
      // Create or update the category
      const categoryData = await prisma.category.upsert({
        where: { id: category.id },
        update: {
          name: category.name,
          user_id: category.user_id
        },
        create: {
          id: category.id,
          name: category.name,
          user_id: category.user_id
        },
      });

      for (let product of category.products) {
        const exists = await productExists(product.title, categoryData.id);

        if (!exists) {
          // Create the product
          await prisma.product.create({
            data: {
              title: product.title,
              slug: product.slug,
              lang: product.lang,
              auth_id: product.auth_id,
              status: product.status,
              type: product.type,
              count: product.count,
              created_at: new Date(product.created_at),
              updated_at: new Date(product.updated_at),
              category_id: categoryData.id,
              price: product.price.price,
              preview: product.preview.content,
              stock: product.stock.stock,
            },
          });
        }
      }
    }

    res.send('Data berhasil diambil dan disimpan');
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).send('Gagal mengambil dan menyimpan data');
  }
});

// Route to display products from the database with optional category filter
app.get('/products', async (req, res) => {
  try {
    const { limit, categoryId } = req.query;
    const products = await prisma.product.findMany({
      where: categoryId ? { category_id: parseInt(categoryId) } : {},
      take: limit ? parseInt(limit) : undefined,
      include: {
        category: true
      }
    });
    res.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).send('Gagal mengambil data produk');
  }
});

// Route to export products to XML
app.get('/export/xml', async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      include: {
        category: true
      }
    });

    const builder = new Builder();
    const xml = builder.buildObject({ products });

    res.setHeader('Content-disposition', 'attachment; filename=products.xml');
    res.setHeader('Content-type', 'text/xml');
    res.send(xml);
  } catch (error) {
    console.error('Error exporting to XML:', error);
    res.status(500).send('Gagal mengekspor data ke XML');
  }
});

// Route to export products to Excel
app.get('/export/excel', async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      include: {
        category: true
      }
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Products');

    worksheet.columns = [
      { header: 'ID', key: 'id' },
      { header: 'Title', key: 'title' },
      { header: 'Slug', key: 'slug' },
      { header: 'Lang', key: 'lang' },
      { header: 'Auth ID', key: 'auth_id' },
      { header: 'Status', key: 'status' },
      { header: 'Type', key: 'type' },
      { header: 'Count', key: 'count' },
      { header: 'Created At', key: 'created_at' },
      { header: 'Updated At', key: 'updated_at' },
      { header: 'Category ID', key: 'category_id' },
      { header: 'Category Name', key: 'category_name' },
      { header: 'Price', key: 'price' },
      { header: 'Preview', key: 'preview' },
      { header: 'Stock', key: 'stock' },
    ];

    products.forEach(product => {
      worksheet.addRow({
        id: product.id,
        title: product.title,
        slug: product.slug,
        lang: product.lang,
        auth_id: product.auth_id,
        status: product.status,
        type: product.type,
        count: product.count,
        created_at: product.created_at,
        updated_at: product.updated_at,
        category_id: product.category_id,
        category_name: product.category.name,
        price: product.price,
        preview: product.preview,
        stock: product.stock,
      });
    });

    res.setHeader('Content-disposition', 'attachment; filename=products.xlsx');
    res.setHeader('Content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting to Excel:', error);
    res.status(500).send('Gagal mengekspor data ke Excel');
  }
});

// Route to update a product
app.put('/products/:id', async (req, res) => {
  const productId = parseInt(req.params.id);
  const { title, slug, lang, auth_id, status, type, count, price, preview, stock, category_id } = req.body;

  try {
    const updatedProduct = await prisma.product.update({
      where: { id: productId },
      data: {
        title,
        slug,
        lang,
        auth_id,
        status,
        type,
        count,
        price,
        preview,
        stock,
        category_id
      },
    });

    res.json(updatedProduct);
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).send('Gagal memperbarui produk');
  }
});

// Route to delete a product
app.delete('/products/:id', async (req, res) => {
  const productId = parseInt(req.params.id);

  try {
    await prisma.product.delete({
      where: { id: productId },
    });

    res.send('Produk berhasil dihapus');
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).send('Gagal menghapus produk');
  }
});

// Route to add a new product
app.post('/products', async (req, res) => {
  const { title, slug, lang, auth_id, status, type, count, created_at, updated_at, category_id, price, preview, stock } = req.body;

  try {
    const newProduct = await prisma.product.create({
      data: {
        title,
        slug,
        lang,
        auth_id,
        status,
        type,
        count,
        created_at: new Date(created_at),
        updated_at: new Date(updated_at),
        category_id,
        price,
        preview,
        stock,
      },
    });

    res.json(newProduct);
  } catch (error) {
    console.error('Error adding product:', error);
    res.status(500).send('Gagal menambahkan produk');
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});
