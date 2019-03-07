'use strict';

var expect  = require('chai').expect;
var request = require('request');

module.exports = function (app, db) {

  app.route('/api/stock-prices')
    .get(function (req, res){
    
      // Get ip from the request:
      let ip = (req.headers['x-forwarded-for'] || req.connection.remoteAddress).slice(0, 14);
    
      // Determine if it was liked,
      // The 'ip' variable is used to increment likes in the db:
      let toUpdate = {};
      if(req.query.like)
        toUpdate = { $addToSet: { likes: ip } };
    
      // SINGLE STOCK QUERY:
      if(typeof req.query.stock !== 'object') {

        // Get the stock:
        let stock = req.query.stock;
        
        // Stock API URL:
        let api_url = `https://cloud.iexapis.com/beta/stock/${stock}/quote?token=${process.env.API_KEY}`;

        request(api_url, function(err, response, body) {
          // Check for correct input:
          if(err || body === 'Unknown symbol')
            return res.send("Error requesting data.");

          // Parse the received body:
          body = JSON.parse(body);

          // Create stockData object:
          let stock_data = {
            stockData: {
              stock: req.query.stock,
              price: body.iexRealtimePrice,
              likes: 0
            }
          }
          
          // Add stock data to the collection:
          toUpdate["$set"] = { stock, price: body.iexRealtimePrice };

          // Search for the stock in the database.
          // Increments the number of likes,
          // Inserts a new document if none is found:
          db.collection('stock').findOneAndUpdate(
            { stock: stock },
            toUpdate,
            { upsert: true, returnOriginal: false },
            (err, doc) => {
              if(err)
                return res.send("Error accessing the DB.");

              if(doc.value.likes)
                stock_data.stockData.likes = doc.value.likes.length;
              else 
                stock_data.stockData.likes = 0;
              
              return res.json(stock_data);
            });
        });
      }
      // TWO STOCKS QUERY:
      else {
       
        // Get stock names from query:
        let stock1 = req.query.stock[0];
        let stock2 = req.query.stock[1];
        
        // Define API URL for each stock:
        let api_url1 = `https://cloud.iexapis.com/beta/stock/${stock1}/quote?token=${process.env.API_KEY}`;
        let api_url2 = `https://cloud.iexapis.com/beta/stock/${stock2}/quote?token=${process.env.API_KEY}`;
        
        // Get stock1 data:
        request(api_url1, function(err, response, body) {
          // Check for correct input:
          if(err || body === 'Unknown symbol')
            return res.send("Error requesting data.");

          // Get stock2 data:
          request(api_url2, function(err2, response2, body2) {
            // Check for correct input:
            if(err2 || body2 === 'Unknown symbol')
              return res.send("Error requesting data.");
            
            // Parse the received bodies:
            body  = JSON.parse(body);
            body2 = JSON.parse(body2);
            
            // Create stockData object:
            let stock_data = {
              stockData: [
                {
                  stock: stock1,
                  price: body.iexRealtimePrice,
                  rel_likes: 0
                },
                {
                  stock: stock2,
                  price: body2.iexRealtimePrice,
                  rel_likes: 0
                }
              ]
            }
            
            // Add stock data to the collection:
            toUpdate["$set"] = { stock1, price: body.iexRealtimePrice };

            // Search for the stocks in the database.
            // Increments the number of likes,
            // Inserts a new document if none is found:
            db.collection('stock').findOneAndUpdate(
              { stock: stock1 },
              toUpdate,
              { upsert: true, returnOriginal: false },
              (err1, doc1) => {
                if(err1)
                  return res.send("Error accessing the DB.");
                
                // Add stock data to the collection:
                toUpdate["$set"] = { stock2, price: body2.iexRealtimePrice };
                
                // Query database for second stock:
                db.collection('stock').findOneAndUpdate(
                  { stock: stock2 },
                  toUpdate,
                  { upsert: true, returnOriginal: false },
                  (err2, doc2) => {
                    if(err2)
                      return res.send("Error accessing the DB.");

                    // Determine rel_likes:
                    let doc1_likes = 0;
                    let doc2_likes = 0;
                    
                    if(doc1.value.likes)
                      doc1_likes = doc1.value.likes.length;
                    if(doc2.value.likes)
                      doc2_likes = doc2.value.likes.length;
                    
                    let rel_likes = doc1_likes - doc2_likes;
                    stock_data.stockData[0].rel_likes = rel_likes;
                    stock_data.stockData[1].rel_likes = rel_likes * -1;
                    
                    return res.json(stock_data);
                  }); // End db collection stock2.
              }); // End db collection stock1.
          }); // End request stock2.
        }); // End request stock1.
      } // End of query for two stocks.
    }); // End of the request
    
};
