use crate::database::{get_db_path, get_connection, get_table_cart, save_table_cart, clear_table_cart, get_all_table_carts};
use crate::models::{TableCart, CartItem, CreateCartItemRequest, UpdateCartItemRequest};
use tauri::command;
use uuid::Uuid;
use chrono::Utc;
use serde::Deserialize;

#[derive(Deserialize)]
pub struct GetTableCartRequest {
    pub table_id: String,
}

#[command]
pub fn get_table_cart_command(request: GetTableCartRequest) -> Result<Option<TableCart>, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = get_connection(&db_path).map_err(|e| e.to_string())?;
    get_table_cart(&conn, &request.table_id).map_err(|e| e.to_string())
}

#[derive(Deserialize)]
pub struct AddItemToCartRequest {
    pub table_id: String,
    pub item_request: CreateCartItemRequest,
}

#[command]
pub fn add_item_to_cart(request: AddItemToCartRequest) -> Result<TableCart, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = get_connection(&db_path).map_err(|e| e.to_string())?;
    
    // Obtener el carrito existente o crear uno nuevo
    let mut cart = match get_table_cart(&conn, &request.table_id).map_err(|e| e.to_string())? {
        Some(existing_cart) => existing_cart,
        None => {
            let now = Utc::now();
            TableCart {
                id: Uuid::new_v4().to_string(),
                table_id: request.table_id.clone(),
                items: Vec::new(),
                total_amount: 0.0,
                created_at: now,
                updated_at: now,
            }
        }
    };
    
    // Verificar si el producto ya existe en el carrito
    let existing_item_index = cart.items.iter().position(|item| item.product_id == request.item_request.product_id);
    
    if let Some(index) = existing_item_index {
        // Actualizar la cantidad
        let item = &mut cart.items[index];
        item.quantity += request.item_request.quantity;
        item.total_price = item.unit_price * item.quantity as f64;
    } else {
        // Agregar un nuevo artículo
        let new_item = CartItem {
            product_id: request.item_request.product_id,
            product_name: request.item_request.product_name,
            quantity: request.item_request.quantity,
            unit_price: request.item_request.unit_price,
            total_price: request.item_request.unit_price * request.item_request.quantity as f64,
        };
        cart.items.push(new_item);
    }
    
    // Recalcular el total
    cart.total_amount = cart.items.iter().map(|item| item.total_price).sum();
    cart.updated_at = Utc::now();
    
    // Guardar el carrito
    save_table_cart(&conn, &cart).map_err(|e| e.to_string())?;
    
    Ok(cart)
}

#[derive(Deserialize)]
pub struct UpdateCartItemCommandRequest {
    pub table_id: String,
    pub product_id: String,
    pub update_request: UpdateCartItemRequest,
}

#[command]
pub fn update_cart_item(request: UpdateCartItemCommandRequest) -> Result<TableCart, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = get_connection(&db_path).map_err(|e| e.to_string())?;
    
    let mut cart = get_table_cart(&conn, &request.table_id).map_err(|e| e.to_string())?
        .ok_or("Carrito no encontrado")?;
    
    // Encontrar y actualizar el artículo
    if let Some(item) = cart.items.iter_mut().find(|item| item.product_id == request.product_id) {
        item.quantity = request.update_request.quantity;
        item.total_price = item.unit_price * item.quantity as f64;
        
        // Recalcular el total
        cart.total_amount = cart.items.iter().map(|item| item.total_price).sum();
        cart.updated_at = Utc::now();
        
        // Guardar el carrito
        save_table_cart(&conn, &cart).map_err(|e| e.to_string())?;
        
        Ok(cart)
    } else {
        Err("Producto no encontrado en el carrito".to_string())
    }
}

#[derive(Deserialize)]
pub struct RemoveItemFromCartRequest {
    pub table_id: String,
    pub product_id: String,
}

#[command]
pub fn remove_item_from_cart(request: RemoveItemFromCartRequest) -> Result<TableCart, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = get_connection(&db_path).map_err(|e| e.to_string())?;
    
    let mut cart = get_table_cart(&conn, &request.table_id).map_err(|e| e.to_string())?
        .ok_or("Carrito no encontrado")?;
    
    // Eliminar el artículo
    cart.items.retain(|item| item.product_id != request.product_id);
    
    // Recalcular el total
    cart.total_amount = cart.items.iter().map(|item| item.total_price).sum();
    cart.updated_at = Utc::now();
    
    // Guardar el carrito
    save_table_cart(&conn, &cart).map_err(|e| e.to_string())?;
    
    Ok(cart)
}

#[derive(Deserialize)]
pub struct ClearTableCartRequest {
    pub table_id: String,
}

#[command]
pub fn clear_table_cart_command(request: ClearTableCartRequest) -> Result<(), String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = get_connection(&db_path).map_err(|e| e.to_string())?;
    clear_table_cart(&conn, &request.table_id).map_err(|e| e.to_string())
}

#[command]
pub fn get_all_table_carts_command() -> Result<Vec<TableCart>, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = get_connection(&db_path).map_err(|e| e.to_string())?;
    get_all_table_carts(&conn).map_err(|e| e.to_string())
}
