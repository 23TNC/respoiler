extends Node2D

const RECT_COUNT := 10
const RECT_PIXEL_SIZE := Vector2(64, 128)
const RECT_GRID_SIZE := Vector2i(2, 4)
const GRID_CELL_SIZE := 32
const GRID_ORIGIN := Vector2(96, 64)
const GRID_SIZE := Vector2i(24, 18)

var occupied_cells: Dictionary = {}
var rectangles: Array[ColorRect] = []

var dragging_rect: ColorRect = null
var drag_offset := Vector2.ZERO
var drag_start_position := Vector2.ZERO
var drag_start_cells: Array[Vector2i] = []


func _ready() -> void:
	randomize()
	spawn_rectangles()
	queue_redraw()


func _draw() -> void:
	var grid_pixel_size := Vector2(GRID_SIZE.x * GRID_CELL_SIZE, GRID_SIZE.y * GRID_CELL_SIZE)
	draw_rect(Rect2(GRID_ORIGIN, grid_pixel_size), Color(0.08, 0.08, 0.08), true)
	for x in range(GRID_SIZE.x + 1):
		var x_pos := GRID_ORIGIN.x + x * GRID_CELL_SIZE
		draw_line(Vector2(x_pos, GRID_ORIGIN.y), Vector2(x_pos, GRID_ORIGIN.y + grid_pixel_size.y), Color(0.25, 0.25, 0.25), 1.0)
	for y in range(GRID_SIZE.y + 1):
		var y_pos := GRID_ORIGIN.y + y * GRID_CELL_SIZE
		draw_line(Vector2(GRID_ORIGIN.x, y_pos), Vector2(GRID_ORIGIN.x + grid_pixel_size.x, y_pos), Color(0.25, 0.25, 0.25), 1.0)


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			try_start_drag(event.position)
		else:
			try_drop_dragged_rect()

	if event is InputEventMouseMotion and dragging_rect != null:
		dragging_rect.position = event.position - drag_offset


func try_start_drag(mouse_position: Vector2) -> void:
	if dragging_rect != null:
		return

	var rect := get_top_rect_at(mouse_position)
	if rect == null:
		return

	dragging_rect = rect
	dragging_rect.z_index = 10
	drag_start_position = rect.position
	drag_start_cells = get_cells_for_position(rect.position)
	release_cells(drag_start_cells)
	drag_offset = mouse_position - rect.position


func try_drop_dragged_rect() -> void:
	if dragging_rect == null:
		return

	var snapped_position := snap_to_grid(dragging_rect.position)
	var drop_cells := get_cells_for_position(snapped_position)

	if is_valid_drop(drop_cells):
		occupy_cells(dragging_rect, drop_cells)
		tween_rect_to(dragging_rect, snapped_position)
	else:
		occupy_cells(dragging_rect, drag_start_cells)
		tween_rect_to(dragging_rect, drag_start_position)

	dragging_rect.z_index = 0
	dragging_rect = null
	drag_start_cells.clear()


func is_valid_drop(cells: Array[Vector2i]) -> bool:
	if cells.size() != RECT_GRID_SIZE.x * RECT_GRID_SIZE.y:
		return false

	for cell in cells:
		if not is_cell_inside_grid(cell):
			return false
		if occupied_cells.has(cell):
			return false
	return true


func get_top_rect_at(mouse_position: Vector2) -> ColorRect:
	for i in range(rectangles.size() - 1, -1, -1):
		var rect := rectangles[i]
		if Rect2(rect.position, RECT_PIXEL_SIZE).has_point(mouse_position):
			return rect
	return null


func spawn_rectangles() -> void:
	for i in range(RECT_COUNT):
		var spawn_cell := find_open_spawn_cell()
		if spawn_cell == null:
			push_warning("Could not place rectangle %d due to lack of free space." % i)
			continue

		var rect := ColorRect.new()
		rect.custom_minimum_size = RECT_PIXEL_SIZE
		rect.size = RECT_PIXEL_SIZE
		rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
		rect.color = Color.from_hsv(randf(), 0.6, 0.95)
		rect.position = cell_to_position(spawn_cell)
		add_child(rect)

		var cells := get_cells_for_position(rect.position)
		occupy_cells(rect, cells)
		rectangles.append(rect)


func find_open_spawn_cell() -> Variant:
	var max_x := GRID_SIZE.x - RECT_GRID_SIZE.x
	var max_y := GRID_SIZE.y - RECT_GRID_SIZE.y
	var attempts := 1000

	for _i in range(attempts):
		var candidate := Vector2i(randi_range(0, max_x), randi_range(0, max_y))
		var cells := get_cells_for_cell(candidate)
		if is_valid_drop(cells):
			return candidate

	return null


func get_cells_for_position(world_position: Vector2) -> Array[Vector2i]:
	var top_left_cell := position_to_cell(world_position)
	return get_cells_for_cell(top_left_cell)


func get_cells_for_cell(top_left_cell: Vector2i) -> Array[Vector2i]:
	var cells: Array[Vector2i] = []
	for x in range(RECT_GRID_SIZE.x):
		for y in range(RECT_GRID_SIZE.y):
			cells.append(top_left_cell + Vector2i(x, y))
	return cells


func occupy_cells(rect: ColorRect, cells: Array[Vector2i]) -> void:
	for cell in cells:
		occupied_cells[cell] = rect


func release_cells(cells: Array[Vector2i]) -> void:
	for cell in cells:
		occupied_cells.erase(cell)


func is_cell_inside_grid(cell: Vector2i) -> bool:
	return cell.x >= 0 and cell.y >= 0 and cell.x < GRID_SIZE.x and cell.y < GRID_SIZE.y


func snap_to_grid(world_position: Vector2) -> Vector2:
	var relative := world_position - GRID_ORIGIN
	var snapped_cell := Vector2i(round(relative.x / GRID_CELL_SIZE), round(relative.y / GRID_CELL_SIZE))
	return cell_to_position(snapped_cell)


func cell_to_position(cell: Vector2i) -> Vector2:
	return GRID_ORIGIN + Vector2(cell.x * GRID_CELL_SIZE, cell.y * GRID_CELL_SIZE)


func position_to_cell(world_position: Vector2) -> Vector2i:
	var relative := world_position - GRID_ORIGIN
	return Vector2i(round(relative.x / GRID_CELL_SIZE), round(relative.y / GRID_CELL_SIZE))


func tween_rect_to(rect: ColorRect, target_position: Vector2) -> void:
	var tween := create_tween()
	tween.tween_property(rect, "position", target_position, 0.18).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
