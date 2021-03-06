const express = require('express');
const bodyParser = require('body-parser');
const {complete, sanitize, isJSON} = require('utils');
const {Inventory, Item, Workspace} = require('models');
const c = require('const');

module.exports = function(router) {
  /*
   * Sends information about the inventory of a workspace
   */
  router.get('/api/workspaces/:workspace_id/inventory', (req, res) => {
    Workspace.findOne({'_id': req.params.workspace_id, 'deleted': false}).select('-_id -name -users -deleted').populate({
      path: 'inventory',
      select: '-_id  -__v',
      populate: {
        path: 'items',
        select: ' -__v'
      }
    }).exec((err, inventory) => {
      if (err || !inventory) {
        res.status(c.status.INTERNAL_SERVER_ERROR).json({'error': 'Error querying for inventory: ' + err});
        return;
      }

      res.status(c.status.OK).json(inventory);
    });
  });

  /*
   * Add item to inventory
   */
  router.post('/api/workspaces/:workspace_id/inventory', (req, res) => {
    let fields = [
      'name',
      'quantities'
    ];

    // Check if request contains necessary fields
    if (fields && !complete(req.body, fields)) {
      res.status(c.status.BAD_REQUEST).json({'error': 'Missing fields'});
      return;
    }
    else if (typeof(req.body.quantities) !== 'object' && !isJSON(req.body.quantities)) {
      res.status(c.status.BAD_REQUEST).json({'error': 'Invalid JSON syntax'});
      return;
    }

    sanitize(req.body, fields);

    // Check if item exists
    Item.findOne({name: req.body.name}).exec((err, item) => {
      if (err) {
        res.status(c.status.INTERNAL_SERVER_ERROR).json({'error': 'Error querying for item: ' + err});
        return;
      }

      // If it already exists, send back an error
      if (item) {
        res.status(c.status.BAD_REQUEST).json({'error': 'Item with this name already exists'});
        return;
      }
      else {
        // Create new item
        let item = new Item({
          'name': req.body.name,
          'quantities': req.body.quantities
        });

        item.save((err, item) => {
          if (err) {
            res.status(c.status.INTERNAL_SERVER_ERROR).json({'error': 'Error saving item to database: ' + err});
            return;
          }

          // Find workspace by workspace_id in endpoint
          Workspace.findOne({'_id': req.params.workspace_id, 'deleted': false}).exec((err, workspace) => {
            if (err) {
              res.status(c.status.INTERNAL_SERVER_ERROR).json({'error': 'Error adding item to inventory: ' + err});
              return;
            }

            // Find inventory by inventory_id
            Inventory.findOneAndUpdate({'_id': workspace.inventory}).exec((err, inventory) => {
              if (err) {
                res.status(c.status.INTERNAL_SERVER_ERROR).json({'error': 'Error adding item to inventory: ' + err});
                return;
              }

              // Add item to inventory and save
              inventory['items'].push(item._id);
              inventory.save((err) => {
                if (err) {
                  res.status(c.status.INTERNAL_SERVER_ERROR).json({'error': 'Error saving item to inventory: ' + err});
                  return;
                }

                res.status(c.status.OK).json({'message': 'Successfully added item to inventory'});
              });
            });
          });
        });
      }
    });
  });

  /*
   * Sends information on a specific item
   */
  router.get('/api/workspaces/:workspace_id/inventory/:item_id', (req, res) => {
    Item.findById(req.params.item_id).select('-_id').exec((err, item) => {
      if (err) {
        res.status(c.status.INTERNAL_SERVER_ERROR).json({'error': 'Error querying for item: ' + err});
        return;
      }
      else if (!item) {
        res.status(c.status.BAD_REQUEST).json({'error': 'No item exists with that id'});
        return;
      }

      res.status(c.status.OK).json(item);
    });
  });

  /*
   * Updating quantities for some specified item
   */
  router.put('/api/workspaces/:workspace_id/inventory/:item_id', (req, res) => {
    if (!req.body) {
      res.status(c.status.OK).json({'message': 'No fields to update'});
      return;
    }
    else if (req.body && !isJSON(req.body.quantities)) {
      res.status(c.status.BAD_REQUEST).json({'message': 'Invalid JSON for field `quantities`'});
      return;
    }

    // In the future, add functionality to change item's name
    let fields = [
      'quantities'
    ];
    let toUpdate = {};

    fields.forEach(field => {
      if (req.body.hasOwnProperty(field)) {
        if (field === 'quantities') {
          toUpdate[field] = JSON.parse(req.body[field]);
        }
        else {
          toUpdate[field] = req.body[field];
        }
      }
    });

    Item.findById(req.params.item_id).exec((err, item) => {
      if (err) {
        res.status(c.status.INTERNAL_SERVER_ERROR).json({'error': 'Error updating item(s): ' + err});
        return;
      }
      else if (!item) {
        res.status(c.status.BAD_REQUEST).json({'error': 'No item with this id exists'});
        return;
      }

      Object.keys(toUpdate['quantities']).forEach(quantity => {
        if (item.quantities.hasOwnProperty(quantity)) {
          item.quantities[quantity] += toUpdate['quantities'][quantity];
        }
        else {
          item.quantities[quantity] = toUpdate['quantities'][quantity];
        }

        if (item.quantities[quantity] <= 0) {
          delete item.quantities[quantity];
        }
      });

      item.markModified('quantities');

      item.save((err, item) => {
        if (err) {
          res.status(c.status.INTERNAL_SERVER_ERROR).json({'error': 'Error saving item(s) to database: ' + err});
          return;
        }

        res.status(c.status.OK).json({'message': 'Successfully updated item(s)'});
      });
    });
  });
}
