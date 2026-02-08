import { Grid, OrbitControls } from '@react-three/drei'
import { Canvas, ThreeEvent, useThree } from '@react-three/fiber'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useApp } from '../../../shared/contexts/AppContext'
import { getTableStatusConfig, tablePlannerIntegrationService, type TablePlannerItem } from '../services/tablePlannerIntegration'
import { usePlannerStore } from '../store/plannerStore'
import type { RestaurantItem } from '../types/planner'
import { GRID_CONFIG } from '../utils/plannerConstants'
import { GRID_UTILS } from '../utils/plannerGridUtils'

// Función para crear una textura con texto para las mesas
const createTableTexture = (tableNumber: number, status: string, capacity: number) => {
    try {
        const canvas = document.createElement('canvas')
        canvas.width = 256
        canvas.height = 256
        const ctx = canvas.getContext('2d')

        if (!ctx) {
            console.error('Imposible crear el contexto 2D para la textura de la mesa')
            return null
        }

        // Fondo de la textura
        ctx.fillStyle = '#8B4513'
        ctx.fillRect(0, 0, 256, 256)

        // Bordure
        ctx.strokeStyle = '#654321'
        ctx.lineWidth = 8
        ctx.strokeRect(4, 4, 248, 248)

        // Color de fondo según el estado
        const statusConfig = getTableStatusConfig(status)
        ctx.fillStyle = statusConfig.bgColor
        ctx.fillRect(12, 12, 232, 232)

        // Número de mesa (grande)
        ctx.fillStyle = '#000000'
        ctx.font = 'bold 48px Arial'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(`Table ${tableNumber}`, 128, 80)

        // Estado
        ctx.fillStyle = statusConfig.color
        ctx.font = 'bold 24px Arial'
        ctx.fillText(statusConfig.label, 128, 120)

        // Capacidad
        ctx.fillStyle = '#666666'
        ctx.font = '20px Arial'
        ctx.fillText(`${capacity} places`, 128, 150)

        // Icono de estado
        ctx.font = '32px Arial'
        ctx.fillText(statusConfig.icon, 128, 180)

        const texture = new THREE.CanvasTexture(canvas)
        texture.needsUpdate = true
        return texture
    } catch (error) {
        console.error('Error al crear la textura de la mesa:', error)
        return null
    }
}

// Función para crear un número 3D flotante elegante
const createFloatingNumber3D = (number: number) => {
    // Crear una textura con el número
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const ctx = canvas.getContext('2d')

    if (!ctx) return null

    // Fondo transparente
    ctx.clearRect(0, 0, 128, 128)

    // Número en blanco con sombra
    ctx.shadowColor = '#000000'
    ctx.shadowBlur = 4
    ctx.shadowOffsetX = 2
    ctx.shadowOffsetY = 2

    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 80px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(number.toString(), 64, 64)

    // Efecto de brillo
    ctx.shadowColor = 'transparent'
    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 80px Arial'
    ctx.fillText(number.toString(), 64, 64)

    const texture = new THREE.CanvasTexture(canvas)
    texture.needsUpdate = true
    return texture
}

// Componente para mostrar información de la mesa en 3D
const TableInfoDisplay3D: React.FC<{ tableId: string; tableNumber?: number }> = ({ tableId, tableNumber }) => {
    const [tableInfo, setTableInfo] = useState<{
        status: string
        capacity: number
    } | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        const loadTableInfo = async () => {
            try {
                const tables = await tablePlannerIntegrationService.getAllTablesWithStatus()
                const table = tables.find(t => t.id === tableId)
                if (table) {
                    setTableInfo({
                        status: table.status,
                        capacity: table.capacity
                    })
                }
            } catch (error) {
                console.error('Error al cargar la información de la mesa:', error)
            } finally {
                setIsLoading(false)
            }
        }

        loadTableInfo()
    }, [tableId])

    if (isLoading) {
        return (
            <div className="px-3 py-2 bg-gray-100 text-gray-600 rounded text-sm">
                Chargement...
            </div>
        )
    }

    if (!tableInfo) {
        return (
            <div className="px-3 py-2 bg-gray-100 text-gray-600 rounded text-sm">
                Informations non disponibles
            </div>
        )
    }

    const statusConfig = getTableStatusConfig(tableInfo.status)

    return (
        <div className="space-y-2">
            <div className="px-3 py-2 bg-green-100 text-green-800 rounded text-sm font-medium">
                🍽️ Table Restaurant #{tableNumber}
            </div>

            <div className="px-3 py-2 bg-white border border-gray-200 rounded text-sm">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-600">Statut:</span>
                    <div className="flex items-center space-x-1">
                        <span className="text-sm">{statusConfig.icon}</span>
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusConfig.bgColor} ${statusConfig.color}`}>
                            {statusConfig.label}
                        </span>
                    </div>
                </div>

                <div className="flex items-center justify-between">
                    <span className="text-gray-600">Capacité:</span>
                    <span className="text-xs font-medium bg-gray-100 px-2 py-1 rounded-full">
                        {tableInfo.capacity} places
                    </span>
                </div>
            </div>
        </div>
    )
}



// Componente para objetos 3D
const RestaurantObject: React.FC<{
    item: RestaurantItem
    tableData?: TablePlannerItem
}> = ({ item, tableData }) => {
    const meshRef = useRef<THREE.Mesh>(null)
    const { selectItem, selectedItem, startExpandingLine } = usePlannerStore()
    const { openModule } = useApp()
    const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const clickCountRef = useRef(0)
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const isLongPressingRef = useRef(false)





    const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation()

        // Las mesas largas no pueden ser extendidas
        if (item.metadata?.isLongTable && item.metadata?.catalogItemId !== 'table-with-chairs') {
            return
        }

        // Si es un objeto de línea temporal, no hacer nada
        if (item.id.includes('-line-') && usePlannerStore.getState().isExpandingLine) {
            return
        }

        // Si ya estamos en modo colocación o expansión, no iniciar nuevos temporizadores
        if (usePlannerStore.getState().isPlacing || usePlannerStore.getState().isExpandingLine) {
            return
        }

        // Iniciar el temporizador de clic largo
        isLongPressingRef.current = false
        longPressTimerRef.current = setTimeout(() => {
            isLongPressingRef.current = true
            startExpandingLine(item)
        }, 500)
    }

    const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation()

        // Las mesas largas no pueden ser extendidas, pero pueden ser seleccionadas
        if (item.metadata?.isLongTable && item.metadata?.catalogItemId !== 'table-with-chairs') {
            // Clic simple - seleccionar el objeto
            selectItem(selectedItem?.id === item.id ? null : item)
            return
        }

        // Si es un objeto de línea temporal, no hacer nada
        if (item.id.includes('-line-') && usePlannerStore.getState().isExpandingLine) {
            return
        }

        // Si ya estamos en modo colocación o expansión, no procesar clics
        if (usePlannerStore.getState().isPlacing || usePlannerStore.getState().isExpandingLine) {
            return
        }

        // Cancelar el temporizador de clic largo
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current)
            longPressTimerRef.current = null
        }

        // Si fue un clic largo, no tratar como clic simple
        if (isLongPressingRef.current) {
            isLongPressingRef.current = false
            return
        }

        // Gestión de doble clic
        clickCountRef.current++

        if (clickCountRef.current === 1) {
            // Primer clic - esperar el segundo
            clickTimerRef.current = setTimeout(() => {
                // Clic simple - seleccionar el objeto
                selectItem(selectedItem?.id === item.id ? null : item)
                clickCountRef.current = 0
            }, 300)
        } else if (clickCountRef.current === 2) {
            // Doble clic detectado
            if (clickTimerRef.current) {
                clearTimeout(clickTimerRef.current)
                clickTimerRef.current = null
            }
            startExpandingLine(item)
            clickCountRef.current = 0
        }
    }

    // Gestión del clic derecho para mesas asociadas
    const handleContextMenu = (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        e.nativeEvent.preventDefault()

        if (tableData?.planner_item.table_id) {
            // Abrir el menú contextual para mesas asociadas
            const table = {
                id: tableData.planner_item.table_id,
                number: tableData.planner_item.table_number || 0,
                name: tableData.planner_item.name,
                capacity: tableData.table_capacity || 4,
                status: tableData.table_status || 'free',
                position_x: item.position.x,
                position_y: item.position.z,
                current_order_id: undefined,
                created_at: tableData.planner_item.created_at,
                updated_at: tableData.planner_item.updated_at
            }

            openModule('pos', { selectedTable: table })
        }
    }

    const handlePointerLeave = (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation()

        // Cancelar todos los temporizadores al salir del objeto
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current)
            longPressTimerRef.current = null
        }
        if (clickTimerRef.current) {
            clearTimeout(clickTimerRef.current)
            clickTimerRef.current = null
        }
        isLongPressingRef.current = false
        clickCountRef.current = 0
    }

    const isSelected = selectedItem?.id === item.id

    // Renderizado especial para mesas largas (prioridad sobre mesa de sillas normal)
    if (item.metadata?.isLongTable) {
        const isHorizontal = item.metadata.direction === 'horizontal'
        const length = isHorizontal ? item.size.width : item.size.depth

        return (
            <group
                position={[
                    item.position.x + (isHorizontal ? length / 2 : 0.5),
                    item.position.y + item.size.height / 2,
                    item.position.z + (isHorizontal ? 0.5 : length / 2)
                ]}
                rotation={[0, item.rotation, 0]}
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerLeave}
            >
                {/* Mesa larga principal */}
                <mesh>
                    <boxGeometry args={[
                        isHorizontal ? length : 0.6,
                        0.08,
                        isHorizontal ? 0.6 : length
                    ]} />
                    <meshStandardMaterial
                        color="#8B4513"
                        transparent={isSelected}
                        opacity={isSelected ? 0.8 : 0.9}
                        roughness={0.8}
                        metalness={0.1}
                    />
                </mesh>

                {/* Pieds de table - plus nombreux pour les tables longues */}
                {Array.from({ length: Math.max(2, Math.floor(length / 2)) }, (_, i) => {
                    const footSpacing = length / (Math.max(2, Math.floor(length / 2)) + 1)
                    const footPos = (i + 1) * footSpacing - length / 2

                    return (
                        <React.Fragment key={i}>
                            <mesh position={isHorizontal ? [footPos, -0.3, 0.2] : [0.2, -0.3, footPos]}>
                                <boxGeometry args={[0.04, 0.6, 0.04]} />
                                <meshStandardMaterial color="#654321" />
                            </mesh>
                            <mesh position={isHorizontal ? [footPos, -0.3, -0.2] : [-0.2, -0.3, footPos]}>
                                <boxGeometry args={[0.04, 0.6, 0.04]} />
                                <meshStandardMaterial color="#654321" />
                            </mesh>
                        </React.Fragment>
                    )
                })}

                {/* Chaises le long de la table longue */}
                {Array.from({ length: Math.floor(length * 2) }, (_, i) => {
                    const chairSpacing = length / (Math.floor(length * 2) + 1)
                    const chairPos = (i + 1) * chairSpacing - length / 2

                    return (
                        <React.Fragment key={i}>
                            {/* Chaises sur les côtés longs */}
                            <mesh position={isHorizontal ? [chairPos, -0.15, 0.4] : [0.4, -0.15, chairPos]}>
                                <boxGeometry args={[0.3, 0.3, 0.04]} />
                                <meshStandardMaterial color="#654321" />
                            </mesh>
                            <mesh position={isHorizontal ? [chairPos, 0.05, 0.4] : [0.4, 0.05, chairPos]}>
                                <boxGeometry args={[0.3, 0.04, 0.25]} />
                                <meshStandardMaterial color="#654321" />
                            </mesh>

                            <mesh position={isHorizontal ? [chairPos, -0.15, -0.4] : [-0.4, -0.15, chairPos]}>
                                <boxGeometry args={[0.3, 0.3, 0.04]} />
                                <meshStandardMaterial color="#654321" />
                            </mesh>
                            <mesh position={isHorizontal ? [chairPos, 0.05, -0.4] : [-0.4, 0.05, chairPos]}>
                                <boxGeometry args={[0.3, 0.04, 0.25]} />
                                <meshStandardMaterial color="#654321" />
                            </mesh>
                        </React.Fragment>
                    )
                })}

                {/* Indicador de selección */}
                {isSelected && (
                    <mesh position={[0, item.size.height / 2 + 0.1, 0]}>
                        <boxGeometry args={[item.size.width + 0.2, 0.1, item.size.depth + 0.2]} />
                        <meshStandardMaterial color="#3b82f6" transparent opacity={0.5} />
                    </mesh>
                )}

                {/* Indicador de cuadrícula */}
                <mesh position={[0, -item.size.height / 2 - 0.01, 0]}>
                    <boxGeometry args={[item.size.width, 0.02, item.size.depth]} />
                    <meshStandardMaterial color="#3b82f6" transparent opacity={0.3} />
                </mesh>
            </group>
        )
    }

    // Renderizado especial para mesas de restaurante
    if (item.metadata?.isRestaurantTable || item.id.startsWith('table-')) {
        // Obtener los datos actualizados de la mesa desde la base de datos
        const [liveTableData, setLiveTableData] = useState<{
            status: string
            capacity: number
            number: number
        } | null>(null)

        useEffect(() => {
            const fetchLiveTableData = async () => {
                try {
                    if (item.metadata?.tableId) {
                        const tables = await tablePlannerIntegrationService.getAllTablesWithStatus()
                        const table = tables.find(t => t.id === item.metadata?.tableId)
                        if (table) {
                            setLiveTableData({
                                status: table.status,
                                capacity: table.capacity,
                                number: table.number
                            })
                        }
                    }
                } catch (error) {
                    console.error('Error al obtener datos en vivo de la mesa:', error)
                }
            }

            fetchLiveTableData()

            // Actualizar cada 5 segundos para cambios de estado
            const interval = setInterval(fetchLiveTableData, 5000)
            return () => clearInterval(interval)
        }, [item.metadata?.tableId])



        // Crear la textura para la mesa si tenemos los datos
        const tableTexture = useMemo(() => {
            // Prioridad a los datos en vivo (actualizados desde la base de datos)
            if (liveTableData) {
                return createTableTexture(
                    liveTableData.number,
                    liveTableData.status,
                    liveTableData.capacity
                )
            }
            // Alternativa a los datos de tableData (si la mesa está asociada)
            else if (tableData?.table_status && tableData.planner_item.table_number && tableData.table_capacity) {
                return createTableTexture(
                    tableData.planner_item.table_number,
                    tableData.table_status,
                    tableData.table_capacity
                )
            }
            // Alternativa a los metadatos del elemento (para mesas recién colocadas)
            else if (item.metadata?.tableNumber && item.metadata?.tableId) {
                return createTableTexture(
                    item.metadata.tableNumber,
                    item.metadata.status || 'free', // Usar el estado desde los metadatos
                    item.metadata.capacity || 4
                )
            }
            return null
        }, [liveTableData, tableData?.table_status, tableData?.planner_item.table_number, tableData?.table_capacity, item.metadata?.tableNumber, item.metadata?.tableId, item.metadata?.capacity])

        // Determinar el color de la mesa según su estado
        let tableColor = "#8B4513" // Color predeterminado
        let currentStatus = 'free'

        // Prioridad a los datos en vivo
        if (liveTableData?.status) {
            currentStatus = liveTableData.status
            const statusConfig = getTableStatusConfig(liveTableData.status)
            tableColor = statusConfig.color
        } else if (tableData?.table_status) {
            currentStatus = tableData.table_status
            const statusConfig = getTableStatusConfig(tableData.table_status)
            tableColor = statusConfig.color
        } else if (item.metadata?.status) {
            currentStatus = item.metadata.status
            const statusConfig = getTableStatusConfig(item.metadata.status)
            tableColor = statusConfig.color
        }

        return (
            <group
                position={[
                    item.position.x + 0.5,
                    item.position.y + item.size.height / 2,
                    item.position.z + 0.5
                ]}
                rotation={[0, item.rotation, 0]}
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerLeave}
                onContextMenu={handleContextMenu as any}
            >
                {/* Table principale avec texture */}
                <mesh>
                    <boxGeometry args={[0.6, 0.08, 0.6]} />
                    <meshStandardMaterial
                        color={tableTexture ? '#ffffff' : tableColor}
                        map={tableTexture || undefined}
                        transparent={isSelected}
                        opacity={isSelected ? 0.8 : 1}
                        roughness={0.2}
                        metalness={0.3}
                        envMapIntensity={0.5}
                    />
                </mesh>

                {/* Effet de brillance sur la surface */}
                {tableTexture && (
                    <mesh position={[0, 0.041, 0]}>
                        <planeGeometry args={[0.58, 0.58]} />
                        <meshStandardMaterial
                            color="#ffffff"
                            transparent
                            opacity={0.1}
                            roughness={0.1}
                            metalness={0.8}
                        />
                    </mesh>
                )}

                {/* Lampe colorée au-dessus de la table */}
                <group position={[0, 0.2, 0]}>
                    {/* Support de la lampe */}
                    <mesh position={[0, 0.05, 0]}>
                        <cylinderGeometry args={[0.02, 0.02, 0.1]} />
                        <meshStandardMaterial color="#333333" />
                    </mesh>

                    {/* Ampoule colorée selon le statut */}
                    <mesh position={[0, 0.15, 0]}>
                        <sphereGeometry args={[0.03, 16, 16]} />
                        <meshStandardMaterial
                            color={getTableStatusConfig(currentStatus).color}
                            emissive={getTableStatusConfig(currentStatus).color}
                            emissiveIntensity={0.3}
                            transparent
                            opacity={0.8}
                        />
                    </mesh>

                    {/* Effet de lumière */}
                    <pointLight
                        position={[0, 0.15, 0]}
                        color={getTableStatusConfig(currentStatus).color}
                        intensity={0.5}
                        distance={0.3}
                    />
                </group>

                {/* Numéro 3D flottant au-dessus de la table */}
                <group position={[0.25, 0.3, 0.25]}>
                    {/* Numéro flottant sans support ni fond */}
                    <mesh position={[0, 0, 0]}>
                        <planeGeometry args={[0.12, 0.12]} />
                        <meshStandardMaterial
                            map={createFloatingNumber3D(liveTableData?.number || item.metadata?.tableNumber || 1)}
                            transparent
                            opacity={0.9}
                            side={THREE.DoubleSide}
                        />
                    </mesh>
                </group>

                {/* Pieds de table */}
                <mesh position={[0.2, -0.3, 0.2]}>
                    <boxGeometry args={[0.04, 0.6, 0.04]} />
                    <meshStandardMaterial color="#654321" />
                </mesh>
                <mesh position={[-0.2, -0.3, 0.2]}>
                    <boxGeometry args={[0.04, 0.6, 0.04]} />
                    <meshStandardMaterial color="#654321" />
                </mesh>
                <mesh position={[0.2, -0.3, -0.2]}>
                    <boxGeometry args={[0.04, 0.6, 0.04]} />
                    <meshStandardMaterial color="#654321" />
                </mesh>
                <mesh position={[-0.2, -0.3, -0.2]}>
                    <boxGeometry args={[0.04, 0.6, 0.04]} />
                    <meshStandardMaterial color="#654321" />
                </mesh>

                {/* Chaises - plus compactes */}
                <mesh position={[0, -0.15, 0.4]}>
                    <boxGeometry args={[0.3, 0.3, 0.04]} />
                    <meshStandardMaterial color="#654321" />
                </mesh>
                <mesh position={[0, 0.05, 0.4]}>
                    <boxGeometry args={[0.3, 0.04, 0.25]} />
                    <meshStandardMaterial color="#654321" />
                </mesh>

                <mesh position={[0, -0.15, -0.4]}>
                    <boxGeometry args={[0.3, 0.3, 0.04]} />
                    <meshStandardMaterial color="#654321" />
                </mesh>
                <mesh position={[0, 0.05, -0.4]}>
                    <boxGeometry args={[0.3, 0.04, 0.25]} />
                    <meshStandardMaterial color="#654321" />
                </mesh>

                <mesh position={[0.4, -0.15, 0]}>
                    <boxGeometry args={[0.04, 0.3, 0.3]} />
                    <meshStandardMaterial color="#654321" />
                </mesh>
                <mesh position={[0.4, 0.05, 0]}>
                    <boxGeometry args={[0.25, 0.04, 0.3]} />
                    <meshStandardMaterial color="#654321" />
                </mesh>

                <mesh position={[-0.4, -0.15, 0]}>
                    <boxGeometry args={[0.04, 0.3, 0.3]} />
                    <meshStandardMaterial color="#654321" />
                </mesh>
                <mesh position={[-0.4, 0.05, 0]}>
                    <boxGeometry args={[0.25, 0.04, 0.3]} />
                    <meshStandardMaterial color="#654321" />
                </mesh>

                {/* Indicateur de sélection */}
                {isSelected && (
                    <mesh position={[0, item.size.height / 2 + 0.1, 0]}>
                        <boxGeometry args={[item.size.width + 0.2, 0.1, item.size.depth + 0.2]} />
                        <meshStandardMaterial color="#3b82f6" transparent opacity={0.5} />
                    </mesh>
                )}

                {/* Indicateur de statut flottant pour les tables sans texture */}
                {!tableTexture && tableData?.table_status && (
                    <group position={[0, item.size.height / 2 + 0.2, 0]}>
                        {/* Cercle de statut */}
                        <mesh>
                            <sphereGeometry args={[0.15, 16, 16]} />
                            <meshStandardMaterial
                                color={getTableStatusConfig(tableData.table_status).color}
                                transparent
                                opacity={0.8}
                            />
                        </mesh>

                        {/* Numéro de table */}
                        {tableData.planner_item.table_number && (
                            <mesh position={[0, 0, 0.16]}>
                                <boxGeometry args={[0.1, 0.02, 0.02]} />
                                <meshStandardMaterial color="white" />
                            </mesh>
                        )}
                    </group>
                )}

                {/* Indicateur de grille */}
                <mesh position={[0, -item.size.height / 2 - 0.01, 0]}>
                    <boxGeometry args={[item.size.width, 0.02, item.size.depth]} />
                    <meshStandardMaterial color="#3b82f6" transparent opacity={0.3} />
                </mesh>
            </group>
        )
    }







    // Renderizado estándar para los otros objetos
    return (
        <mesh
            ref={meshRef}
            position={[
                item.position.x + 0.5,
                item.position.y + item.size.height / 2,
                item.position.z + 0.5
            ]}
            rotation={[0, item.rotation, 0]}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
        >
            <boxGeometry args={[item.size.width, item.size.height, item.size.depth]} />
            <meshStandardMaterial
                color={item.color}
                transparent={isSelected}
                opacity={isSelected ? 0.8 : 1}
            />
            {isSelected && (
                <mesh position={[0, item.size.height / 2 + 0.1, 0]}>
                    <boxGeometry args={[item.size.width + 0.2, 0.1, item.size.depth + 0.2]} />
                    <meshStandardMaterial color="#3b82f6" transparent opacity={0.5} />
                </mesh>
            )}
            {/* Indicateur de grille pour l'objet */}
            <mesh position={[0, -item.size.height / 2 - 0.01, 0]}>
                <boxGeometry args={[item.size.width, 0.02, item.size.depth]} />
                <meshStandardMaterial color="#3b82f6" transparent opacity={0.3} />
            </mesh>
        </mesh>
    )
}

// Componente para objetos en proceso de colocación
const PlacingObject: React.FC = () => {
    const { placingItem, isPlacing, currentLayout } = usePlannerStore()

    // Crear una textura para la mesa en proceso de colocación (siempre llamado)
    const placementTexture = useMemo(() => {
        if (placingItem?.metadata?.tableId && placingItem?.metadata?.tableNumber) {
            // Obtener la información de la mesa desde el store o los metadatos
            const tableNumber = placingItem.metadata.tableNumber
            const status = 'free' // Estado predeterminado para colocación
            const capacity = placingItem.metadata.capacity || 4

            return createTableTexture(tableNumber, status, capacity)
        }
        return null
    }, [placingItem?.metadata?.tableId, placingItem?.metadata?.tableNumber, placingItem?.metadata?.capacity])

    if (!isPlacing || !placingItem) return null

    // Verificar si la colocación es posible
    const canPlace = GRID_UTILS.canPlaceObject(
        placingItem.position,
        placingItem.size,
        currentLayout.items
    )

    // Renderizado especial para mesas largas en proceso de colocación
    if (placingItem.metadata?.isLongTable) {
        const isHorizontal = placingItem.metadata.direction === 'horizontal'
        const length = isHorizontal ? placingItem.size.width : placingItem.size.depth

        return (
            <group
                position={[
                    placingItem.position.x + (isHorizontal ? length / 2 : 0.5),
                    placingItem.position.y + placingItem.size.height / 2,
                    placingItem.position.z + (isHorizontal ? 0.5 : length / 2)
                ]}
                rotation={[0, 0, 0]}
            >
                {/* Table longue principale */}
                <mesh>
                    <boxGeometry args={[
                        isHorizontal ? length : 0.6,
                        0.08,
                        isHorizontal ? 0.6 : length
                    ]} />
                    <meshStandardMaterial
                        color={canPlace ? '#8B4513' : '#ef4444'}
                        transparent
                        opacity={0.6}
                        wireframe
                    />
                </mesh>

                {/* Pieds de table - plus nombreux pour les tables longues */}
                {Array.from({ length: Math.max(2, Math.floor(length / 2)) }, (_, i) => {
                    const footSpacing = length / (Math.max(2, Math.floor(length / 2)) + 1)
                    const footPos = (i + 1) * footSpacing - length / 2

                    return (
                        <React.Fragment key={i}>
                            <mesh position={isHorizontal ? [footPos, -0.3, 0.2] : [0.2, -0.3, footPos]}>
                                <boxGeometry args={[0.04, 0.6, 0.04]} />
                                <meshStandardMaterial color={canPlace ? '#654321' : '#ef4444'} transparent opacity={0.6} />
                            </mesh>
                            <mesh position={isHorizontal ? [footPos, -0.3, -0.2] : [-0.2, -0.3, footPos]}>
                                <boxGeometry args={[0.04, 0.6, 0.04]} />
                                <meshStandardMaterial color={canPlace ? '#654321' : '#ef4444'} transparent opacity={0.6} />
                            </mesh>
                        </React.Fragment>
                    )
                })}

                {/* Chaises le long de la table longue */}
                {Array.from({ length: Math.floor(length * 2) }, (_, i) => {
                    const chairSpacing = length / (Math.floor(length * 2) + 1)
                    const chairPos = (i + 1) * chairSpacing - length / 2

                    return (
                        <React.Fragment key={i}>
                            {/* Chaises sur les côtés longs */}
                            <mesh position={isHorizontal ? [chairPos, -0.15, 0.4] : [0.4, -0.15, chairPos]}>
                                <boxGeometry args={[0.3, 0.3, 0.04]} />
                                <meshStandardMaterial color={canPlace ? '#654321' : '#ef4444'} transparent opacity={0.6} />
                            </mesh>
                            <mesh position={isHorizontal ? [chairPos, 0.05, 0.4] : [0.4, 0.05, chairPos]}>
                                <boxGeometry args={[0.3, 0.04, 0.25]} />
                                <meshStandardMaterial color={canPlace ? '#654321' : '#ef4444'} transparent opacity={0.6} />
                            </mesh>

                            <mesh position={isHorizontal ? [chairPos, -0.15, -0.4] : [-0.4, -0.15, chairPos]}>
                                <boxGeometry args={[0.3, 0.3, 0.04]} />
                                <meshStandardMaterial color={canPlace ? '#654321' : '#ef4444'} transparent opacity={0.6} />
                            </mesh>
                            <mesh position={isHorizontal ? [chairPos, 0.05, -0.4] : [-0.4, 0.05, chairPos]}>
                                <boxGeometry args={[0.3, 0.04, 0.25]} />
                                <meshStandardMaterial color={canPlace ? '#654321' : '#ef4444'} transparent opacity={0.6} />
                            </mesh>
                        </React.Fragment>
                    )
                })}

                {/* Indicateur de grille pour l'objet en placement */}
                <mesh position={[0, -placingItem.size.height / 2 - 0.01, 0]}>
                    <boxGeometry args={[
                        isHorizontal ? length : placingItem.size.width,
                        0.02,
                        isHorizontal ? placingItem.size.depth : length
                    ]} />
                    <meshStandardMaterial color={canPlace ? '#22c55e' : '#ef4444'} transparent opacity={0.5} />
                </mesh>
            </group>
        )
    }

    // Renderizado especial para mesas de restaurante
    if (placingItem.metadata?.isRestaurantTable || placingItem.id.includes('table-')) {
        return (
            <group
                position={[
                    placingItem.position.x + 0.5,
                    placingItem.position.y + placingItem.size.height / 2,
                    placingItem.position.z + 0.5
                ]}
                rotation={[0, 0, 0]}
            >
                {/* Table principale avec texture */}
                <mesh>
                    <boxGeometry args={[0.6, 0.08, 0.6]} />
                    <meshStandardMaterial
                        color={placementTexture ? '#ffffff' : (canPlace ? '#8B4513' : '#ef4444')}
                        map={placementTexture || undefined}
                        transparent
                        opacity={0.8}
                        roughness={0.3}
                        metalness={0.1}
                        wireframe={!placementTexture}
                    />
                </mesh>

                {/* Pieds de table */}
                <mesh position={[0.2, -0.3, 0.2]}>
                    <boxGeometry args={[0.04, 0.6, 0.04]} />
                    <meshStandardMaterial color={canPlace ? '#654321' : '#ef4444'} transparent opacity={0.6} />
                </mesh>
                <mesh position={[-0.2, -0.3, 0.2]}>
                    <boxGeometry args={[0.04, 0.6, 0.04]} />
                    <meshStandardMaterial color={canPlace ? '#654321' : '#ef4444'} transparent opacity={0.6} />
                </mesh>
                <mesh position={[0.2, -0.3, -0.2]}>
                    <boxGeometry args={[0.04, 0.6, 0.04]} />
                    <meshStandardMaterial color={canPlace ? '#654321' : '#ef4444'} transparent opacity={0.6} />
                </mesh>
                <mesh position={[-0.2, -0.3, -0.2]}>
                    <boxGeometry args={[0.04, 0.6, 0.04]} />
                    <meshStandardMaterial color={canPlace ? '#654321' : '#ef4444'} transparent opacity={0.6} />
                </mesh>

                {/* Chaises - plus compactes */}
                <mesh position={[0, -0.15, 0.4]}>
                    <boxGeometry args={[0.3, 0.3, 0.04]} />
                    <meshStandardMaterial color={canPlace ? '#654321' : '#ef4444'} transparent opacity={0.6} />
                </mesh>
                <mesh position={[0, 0.05, 0.4]}>
                    <boxGeometry args={[0.3, 0.04, 0.25]} />
                    <meshStandardMaterial color={canPlace ? '#654321' : '#ef4444'} transparent opacity={0.6} />
                </mesh>

                <mesh position={[0, -0.15, -0.4]}>
                    <boxGeometry args={[0.3, 0.3, 0.04]} />
                    <meshStandardMaterial color={canPlace ? '#654321' : '#ef4444'} transparent opacity={0.6} />
                </mesh>
                <mesh position={[0, 0.05, -0.4]}>
                    <boxGeometry args={[0.3, 0.04, 0.25]} />
                    <meshStandardMaterial color={canPlace ? '#654321' : '#ef4444'} transparent opacity={0.6} />
                </mesh>

                <mesh position={[0.4, -0.15, 0]}>
                    <boxGeometry args={[0.04, 0.3, 0.3]} />
                    <meshStandardMaterial color={canPlace ? '#654321' : '#ef4444'} transparent opacity={0.6} />
                </mesh>
                <mesh position={[0.4, 0.05, 0]}>
                    <boxGeometry args={[0.25, 0.04, 0.3]} />
                    <meshStandardMaterial color={canPlace ? '#654321' : '#ef4444'} transparent opacity={0.6} />
                </mesh>

                <mesh position={[-0.4, -0.15, 0]}>
                    <boxGeometry args={[0.04, 0.3, 0.3]} />
                    <meshStandardMaterial color={canPlace ? '#654321' : '#ef4444'} transparent opacity={0.6} />
                </mesh>
                <mesh position={[-0.4, 0.05, 0]}>
                    <boxGeometry args={[0.25, 0.04, 0.3]} />
                    <meshStandardMaterial color={canPlace ? '#654321' : '#ef4444'} transparent opacity={0.6} />
                </mesh>

                {/* Lampe colorée au-dessus de la table (placement) */}
                <group position={[0, 0.2, 0]}>
                    {/* Support de la lampe */}
                    <mesh position={[0, 0.05, 0]}>
                        <cylinderGeometry args={[0.02, 0.02, 0.1]} />
                        <meshStandardMaterial color="#333333" transparent opacity={0.6} />
                    </mesh>

                    {/* Ampoule colorée selon le statut */}
                    <mesh position={[0, 0.15, 0]}>
                        <sphereGeometry args={[0.03, 16, 16]} />
                        <meshStandardMaterial
                            color={getTableStatusConfig('free').color}
                            emissive={getTableStatusConfig('free').color}
                            emissiveIntensity={0.3}
                            transparent
                            opacity={0.6}
                        />
                    </mesh>
                </group>

                {/* Numéro 3D flottant au-dessus de la table (placement) */}
                <group position={[0.25, 0.3, 0.25]}>
                    {/* Numéro flottant sans support ni fond */}
                    <mesh position={[0, 0, 0]}>
                        <planeGeometry args={[0.12, 0.12]} />
                        <meshStandardMaterial
                            map={createFloatingNumber3D(placingItem.metadata?.tableNumber || 1)}
                            transparent
                            opacity={0.7}
                            side={THREE.DoubleSide}
                        />
                    </mesh>
                </group>

                {/* Indicateur de grille pour l'objet en placement */}
                <mesh position={[0, -placingItem.size.height / 2 - 0.01, 0]}>
                    <boxGeometry args={[placingItem.size.width, 0.02, placingItem.size.depth]} />
                    <meshStandardMaterial color={canPlace ? '#22c55e' : '#ef4444'} transparent opacity={0.5} />
                </mesh>
            </group>
        )
    }

    // Renderizado especial para la mesa con sillas
    if (placingItem.id.includes('table-with-chairs')) {
        return (
            <group
                position={[
                    placingItem.position.x + 0.5,
                    placingItem.position.y + placingItem.size.height / 2,
                    placingItem.position.z + 0.5
                ]}
                rotation={[0, 0, 0]}
            >
                {/* Table principale */}
                <mesh>
                    <boxGeometry args={[0.6, 0.08, 0.6]} />
                    <meshStandardMaterial
                        color={canPlace ? '#8B4513' : '#ef4444'}
                        transparent
                        opacity={0.6}
                        wireframe
                    />
                </mesh>

                {/* Pieds de table */}
                <mesh position={[0.2, -0.3, 0.2]}>
                    <boxGeometry args={[0.04, 0.6, 0.04]} />
                    <meshStandardMaterial color={canPlace ? '#654321' : '#ef4444'} transparent opacity={0.6} />
                </mesh>
                <mesh position={[-0.2, -0.3, 0.2]}>
                    <boxGeometry args={[0.04, 0.6, 0.04]} />
                    <meshStandardMaterial color={canPlace ? '#654321' : '#ef4444'} transparent opacity={0.6} />
                </mesh>
                <mesh position={[0.2, -0.3, -0.2]}>
                    <boxGeometry args={[0.04, 0.6, 0.04]} />
                    <meshStandardMaterial color={canPlace ? '#654321' : '#ef4444'} transparent opacity={0.6} />
                </mesh>
                <mesh position={[-0.2, -0.3, -0.2]}>
                    <boxGeometry args={[0.04, 0.6, 0.04]} />
                    <meshStandardMaterial color={canPlace ? '#654321' : '#ef4444'} transparent opacity={0.6} />
                </mesh>

                {/* Chaises - plus compactes */}
                <mesh position={[0, -0.15, 0.4]}>
                    <boxGeometry args={[0.3, 0.3, 0.04]} />
                    <meshStandardMaterial color={canPlace ? '#654321' : '#ef4444'} transparent opacity={0.6} />
                </mesh>
                <mesh position={[0, 0.05, 0.4]}>
                    <boxGeometry args={[0.3, 0.04, 0.25]} />
                    <meshStandardMaterial color={canPlace ? '#654321' : '#ef4444'} transparent opacity={0.6} />
                </mesh>

                <mesh position={[0, -0.15, -0.4]}>
                    <boxGeometry args={[0.3, 0.3, 0.04]} />
                    <meshStandardMaterial color={canPlace ? '#654321' : '#ef4444'} transparent opacity={0.6} />
                </mesh>
                <mesh position={[0, 0.05, -0.4]}>
                    <boxGeometry args={[0.3, 0.04, 0.25]} />
                    <meshStandardMaterial color={canPlace ? '#654321' : '#ef4444'} transparent opacity={0.6} />
                </mesh>

                <mesh position={[0.4, -0.15, 0]}>
                    <boxGeometry args={[0.04, 0.3, 0.3]} />
                    <meshStandardMaterial color={canPlace ? '#654321' : '#ef4444'} transparent opacity={0.6} />
                </mesh>
                <mesh position={[0.4, 0.05, 0]}>
                    <boxGeometry args={[0.25, 0.04, 0.3]} />
                    <meshStandardMaterial color={canPlace ? '#654321' : '#ef4444'} transparent opacity={0.6} />
                </mesh>

                <mesh position={[-0.4, -0.15, 0]}>
                    <boxGeometry args={[0.04, 0.3, 0.3]} />
                    <meshStandardMaterial color={canPlace ? '#654321' : '#ef4444'} transparent opacity={0.6} />
                </mesh>
                <mesh position={[-0.4, 0.05, 0]}>
                    <boxGeometry args={[0.25, 0.04, 0.3]} />
                    <meshStandardMaterial color={canPlace ? '#654321' : '#ef4444'} transparent opacity={0.6} />
                </mesh>

                {/* Indicateur de grille pour l'objet en placement */}
                <mesh position={[0, -placingItem.size.height / 2 - 0.01, 0]}>
                    <boxGeometry args={[placingItem.size.width, 0.02, placingItem.size.depth]} />
                    <meshStandardMaterial color={canPlace ? '#22c55e' : '#ef4444'} transparent opacity={0.5} />
                </mesh>
            </group>
        )
    }

    // Rendu standard pour les autres objets
    return (
        <mesh
            position={[
                placingItem.position.x + 0.5,
                placingItem.position.y + placingItem.size.height / 2,
                placingItem.position.z + 0.5
            ]}
            rotation={[0, 0, 0]}
        >
            <boxGeometry args={[placingItem.size.width, placingItem.size.height, placingItem.size.depth]} />
            <meshStandardMaterial
                color={canPlace ? '#22c55e' : '#ef4444'}
                transparent
                opacity={0.6}
                wireframe
            />
            {/* Indicateur de grille pour l'objet en placement */}
            <mesh position={[0, -placingItem.size.height / 2 - 0.01, 0]}>
                <boxGeometry args={[placingItem.size.width, 0.02, placingItem.size.depth]} />
                <meshStandardMaterial color={canPlace ? '#22c55e' : '#ef4444'} transparent opacity={0.5} />
            </mesh>
        </mesh>
    )
}

// Componente para los objetos de línea en curso de expansión
const ExpandingLineObjects: React.FC = () => {
    const { lineItems, isExpandingLine, currentLayout } = usePlannerStore()

    if (!isExpandingLine) return null

    return (
        <>
            {lineItems.map((item) => {
                // Verificar si cada objeto de la línea puede ser colocado
                const canPlace = GRID_UTILS.canPlaceObject(
                    item.position,
                    item.size,
                    currentLayout?.items || []
                )

                return (
                    <mesh
                        key={item.id}
                        position={[
                            item.position.x + 0.5,
                            item.position.y + item.size.height / 2,
                            item.position.z + 0.5
                        ]}
                        rotation={[0, item.rotation, 0]}
                    >
                        <boxGeometry args={[item.size.width, item.size.height, item.size.depth]} />
                        <meshStandardMaterial
                            color={canPlace ? item.color : '#ef4444'}
                            transparent
                            opacity={0.6}
                            wireframe={!canPlace}
                        />
                        {/* Indicateur de grille pour l'objet d'extension */}
                        <mesh position={[0, -item.size.height / 2 - 0.01, 0]}>
                            <boxGeometry args={[item.size.width, 0.02, item.size.depth]} />
                            <meshStandardMaterial color={canPlace ? '#22c55e' : '#ef4444'} transparent opacity={0.5} />
                        </mesh>
                    </mesh>
                )
            })}
        </>
    )
}

// Componente para la escena 3D
const Scene: React.FC = () => {
    const { currentLayout } = usePlannerStore()
    const { camera } = useThree()
    const [tableData, setTableData] = useState<TablePlannerItem[]>([])

    // Positionner la caméra
    useEffect(() => {
        camera.position.set(10, 8, 10)
        camera.lookAt(0, 0, 0)
    }, [camera])

    // Cargar los datos de las mesas asociadas
    useEffect(() => {
        if (currentLayout?.id) {
            tablePlannerIntegrationService.getPlannerItemsWithTableStatus(currentLayout.id)
                .then(setTableData)
                .catch(console.error)
        }
    }, [currentLayout?.id])

    // Sincronización en tiempo real de los estados de las mesas
    useEffect(() => {
        if (!currentLayout?.id) return

        const interval = setInterval(() => {
            tablePlannerIntegrationService.getPlannerItemsWithTableStatus(currentLayout.id)
                .then(setTableData)
                .catch(console.error)
        }, 3000) // Actualización cada 3 segundos

        return () => clearInterval(interval)
    }, [currentLayout?.id])

    return (
        <>
            {/* Iluminación mejorada para las texturas */}
            <ambientLight intensity={0.6} />
            <directionalLight
                position={[10, 10, 5]}
                intensity={1.2}
                castShadow
                shadow-mapSize-width={2048}
                shadow-mapSize-height={2048}
            />
            <directionalLight
                position={[-5, 8, -5]}
                intensity={0.8}
                color="#ffffff"
            />
            <pointLight
                position={[0, 15, 0]}
                intensity={0.5}
                color="#ffffff"
                distance={20}
            />

            {/* Grille 3D synchronisée avec la grille 2D */}
            <Grid
                args={[GRID_CONFIG.ROOM_WIDTH, GRID_CONFIG.ROOM_DEPTH]}
                cellSize={1}
                cellThickness={0.15}
                cellColor="#6b7280"
                sectionSize={1}
                sectionThickness={0.3}
                sectionColor="#374151"
                fadeDistance={30}
                fadeStrength={0.8}
                followCamera={false}
                infiniteGrid={true}
                position={[0, 0, 0]}
            />

            {/* Limites de la salle - alignées sur les lignes de grille comme la vue 2D */}
            <mesh position={[0, 1.5, 0.5]}>
                <boxGeometry args={[
                    GRID_CONFIG.ROOM_WIDTH, // 20 - comme la vue 2D
                    3,
                    GRID_CONFIG.ROOM_DEPTH  // 15 - comme la vue 2D
                ]} />
                <meshStandardMaterial color="#f3f4f6" transparent opacity={0.15} wireframe />
            </mesh>

            {/* Objets du restaurant */}
            {currentLayout.items.map((item) => {
                const itemTableData = tableData.find(td => td.planner_item.id === item.id)
                return (
                    <RestaurantObject
                        key={item.id}
                        item={item}
                        tableData={itemTableData}
                    />
                )
            })}

            {/* Objet en cours de placement */}
            <PlacingObject />

            {/* Objets de ligne en cours d'expansion */}
            <ExpandingLineObjects />

            {/* Indicateur visuel quand le mode ligne est actif */}
            {usePlannerStore.getState().isExpandingLine && (
                <mesh position={[0, 0.1, 0]}>
                    <ringGeometry args={[15, 16, 32]} />
                    <meshStandardMaterial color="#ff0000" transparent opacity={0.3} />
                </mesh>
            )}
        </>
    )
}

// Composant principal View3D
const View3D: React.FC = () => {
    const {
        isPlacing,
        isExpandingLine,
        confirmPlacement,
        cancelPlacement,
        confirmExpandingLine,
        cancelExpandingLine,
        selectedItem,
        updateItemRotation,
        removeItem,
        selectItem,
        currentLayout
    } = usePlannerStore()
    const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
    const canvasRef = useRef<HTMLCanvasElement>(null)

    // Función para convertir las coordenadas táctiles en coordenadas del mundo
    const getWorldPosition = (clientX: number, clientY: number) => {
        if (!canvasRef.current) return { x: 0, y: 0, z: 0 }

        const canvas = canvasRef.current
        const rect = canvas.getBoundingClientRect()

        // Calcular la posición relativa en el canvas (0 a 1)
        const relativeX = (clientX - rect.left) / rect.width
        const relativeY = (clientY - rect.top) / rect.height

        // Convertir a coordenadas 3D del mundo (cuadrícula)
        const worldX = Math.floor((relativeX - 0.5) * GRID_CONFIG.ROOM_WIDTH)
        const worldZ = Math.floor((relativeY - 0.5) * GRID_CONFIG.ROOM_DEPTH)

        return { x: worldX, y: 0, z: worldZ }
    }

    const handleMouseMove = (event: React.MouseEvent) => {
        if (isExpandingLine) {
            // En modo agrandamiento, actualizar la línea
            const worldPos = getWorldPosition(event.clientX, event.clientY)
            if (GRID_UTILS.isInBounds(worldPos.x, worldPos.z)) {
                usePlannerStore.getState().updateExpandingLine(worldPos)
            }
            setMousePosition({ x: event.clientX, y: event.clientY })
        } else if (isPlacing && usePlannerStore.getState().placingItem && canvasRef.current) {
            // Modo normal, actualizar la posición
            const worldPos = getWorldPosition(event.clientX, event.clientY)
            if (GRID_UTILS.isInBounds(worldPos.x, worldPos.z)) {
                usePlannerStore.getState().updatePlacingPosition(worldPos)
            }
            setMousePosition({ x: event.clientX, y: event.clientY })
        }
    }

    const handleCanvasClick = (event: React.MouseEvent) => {
        // Solo procesar si realmente se hace clic en el vacío (no en un objeto)
        if (event.target === event.currentTarget) {
            if (isExpandingLine) {
                // En mode agrandissement, valider la ligne
                confirmExpandingLine()
                return
            }

            // Logique normale de placement
            if (isPlacing && usePlannerStore.getState().placingItem) {
                const worldPos = getWorldPosition(event.clientX, event.clientY)
                const canPlace = GRID_UTILS.canPlaceObject(
                    worldPos,
                    usePlannerStore.getState().placingItem!.size,
                    currentLayout.items
                )
                if (canPlace) {
                    confirmPlacement()
                }
            }
        }
    }

    const handleCanvasMissed = useCallback(() => {
        if (isPlacing) {
            confirmPlacement()
        } else if (isExpandingLine) {
            confirmExpandingLine()
        }
    }, [isPlacing, confirmPlacement, isExpandingLine, confirmExpandingLine])

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            if (isPlacing) {
                cancelPlacement()
            } else if (isExpandingLine) {
                cancelExpandingLine()
            }
        }
    }, [isPlacing, cancelPlacement, isExpandingLine, cancelExpandingLine])

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [handleKeyDown])

    return (
        <div className="w-full h-full relative">
            <Canvas
                ref={canvasRef}
                camera={{ position: [10, 8, 10], fov: 50 }}
                shadows
                onPointerMissed={handleCanvasMissed}
                onMouseMove={handleMouseMove}
                onClick={handleCanvasClick}
                className="cursor-crosshair"
            >
                <Scene />
                <OrbitControls
                    enablePan={!isPlacing && !isExpandingLine}
                    enableZoom={!isPlacing && !isExpandingLine}
                    enableRotate={!isPlacing && !isExpandingLine}
                    maxPolarAngle={Math.PI / 2}
                    minDistance={2}
                    maxDistance={20}
                />
            </Canvas>

            {/* Contrôles pour l'objet sélectionné */}
            {selectedItem && (
                <div className="absolute top-4 right-4 bg-white rounded-lg p-3 shadow-lg z-50 border">
                    <div className="flex flex-col space-y-2">
                        <div className="text-sm font-medium text-gray-700 mb-2">
                            {selectedItem.name}
                        </div>

                        {/* Bouton de rotation (seulement pour les objets non-longues) */}
                        {!selectedItem.metadata?.isLongTable && (
                            <button
                                onClick={() => {
                                    const newRotation = (selectedItem.rotation + 90) % 360
                                    updateItemRotation(selectedItem.id, newRotation)
                                }}
                                className="px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-sm"
                            >
                                🔄 Rotation ({selectedItem.rotation}°)
                            </button>
                        )}

                        {/* Indicateur pour les tables restaurant */}
                        {selectedItem.metadata?.isRestaurantTable && (
                            <TableInfoDisplay3D tableId={selectedItem.metadata.tableId} tableNumber={selectedItem.metadata.tableNumber} />
                        )}

                        <button
                            onClick={() => {
                                removeItem(selectedItem.id)
                                selectItem(null)
                            }}
                            className="px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors text-sm"
                        >
                            🗑️ Supprimer
                        </button>
                        <button
                            onClick={() => selectItem(null)}
                            className="px-3 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors text-sm"
                        >
                            ❌ Fermer
                        </button>

                        {selectedItem.metadata?.isLongTable && (
                            <div className="text-xs text-gray-500 mt-1">
                                Table longue (non modifiable)
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Instructions */}
            {(isPlacing || isExpandingLine) && (
                <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg z-10">
                    {isPlacing ? 'Cliquez pour placer l\'objet' : 'Cliquez pour valider la ligne'}
                    <br />
                    <span className="text-sm">Appuyez sur Échap pour annuler</span>
                </div>
            )}

            {/* Indicateur de position de la souris */}
            {(isPlacing || isExpandingLine) && (
                <div
                    className="absolute pointer-events-none z-50 bg-blue-500 text-white px-2 py-1 rounded text-sm"
                    style={{
                        left: mousePosition.x,
                        top: mousePosition.y,
                        transform: 'translate(-50%, -50%)'
                    }}
                >
                    {isExpandingLine
                        ? 'Cliquez pour confirmer la ligne • Échap pour annuler'
                        : 'Double-clic ou clic long pour agrandir • Cliquez pour placer • Échap pour annuler'
                    }
                </div>
            )}

            {/* Aide des raccourcis clavier */}
            {selectedItem && (
                <div className="absolute bottom-4 right-4 bg-gray-800 text-white px-3 py-2 rounded-lg text-xs opacity-80">
                    <div>Raccourcis :</div>
                    <div>• R = Rotation</div>
                    <div>• Delete = Supprimer</div>
                    <div>• Échap = Annuler</div>
                </div>
            )}

            {/* Indicateur de synchronisation */}
            <div className="absolute top-4 left-4 bg-green-500 text-white px-3 py-2 rounded-lg text-xs flex items-center gap-2">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                Synchronisation active
            </div>
        </div>
    )
}

export default View3D
