import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Move, GitBranch, X } from "lucide-react";
import { CampaignBlock, CampaignConnection } from "@/types/campaign";
import { BlockType } from "./BlockPalette";
import { toast } from "sonner";

interface CampaignCanvasProps {
  blocks: CampaignBlock[];
  connections: CampaignConnection[];
  blockTypes: BlockType[];
  selectedBlock: string | null;
  connectingFrom: string | null;
  onBlocksChange: (blocks: CampaignBlock[]) => void;
  onConnectionsChange: (connections: CampaignConnection[]) => void;
  onSelectBlock: (id: string | null) => void;
  onConnectingFromChange: (id: string | null) => void;
}

export function CampaignCanvas({
  blocks,
  connections,
  blockTypes,
  selectedBlock,
  connectingFrom,
  onBlocksChange,
  onConnectionsChange,
  onSelectBlock,
  onConnectingFromChange,
}: CampaignCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [draggingBlock, setDraggingBlock] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent, blockId: string) => {
    if ((e.target as HTMLElement).closest('button')) return;
    
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;
    
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    setDraggingBlock(blockId);
    onSelectBlock(blockId);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggingBlock || !canvasRef.current) return;
    
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const newX = e.clientX - canvasRect.left - dragOffset.x;
    const newY = e.clientY - canvasRect.top - dragOffset.y;
    
    onBlocksChange(blocks.map(b => 
      b.id === draggingBlock 
        ? { ...b, position: { x: Math.max(0, newX), y: Math.max(0, newY) } }
        : b
    ));
  };

  const handleMouseUp = () => {
    setDraggingBlock(null);
  };

  const removeBlock = (blockId: string) => {
    onBlocksChange(blocks.filter(b => b.id !== blockId));
    onConnectionsChange(connections.filter(c => c.from !== blockId && c.to !== blockId));
    if (selectedBlock === blockId) onSelectBlock(null);
  };

  const addConnection = (fromId: string, toId: string) => {
    if (connections.some(c => c.from === fromId && c.to === toId)) {
      toast.error("Connection already exists");
      return;
    }
    if (fromId === toId) {
      toast.error("Cannot connect a block to itself");
      return;
    }
    onConnectionsChange([...connections, { from: fromId, to: toId }]);
    toast.success("Connection created");
  };

  const removeConnection = (fromId: string, toId: string) => {
    onConnectionsChange(connections.filter(c => !(c.from === fromId && c.to === toId)));
    toast.success("Connection removed");
  };

  const handleBlockConnect = (blockId: string) => {
    if (connectingFrom === null) {
      onConnectingFromChange(blockId);
      toast.info("Select target block to connect");
    } else {
      addConnection(connectingFrom, blockId);
      onConnectingFromChange(null);
    }
  };

  const renderConnections = () => {
    return connections.map((conn, idx) => {
      const fromBlock = blocks.find(b => b.id === conn.from);
      const toBlock = blocks.find(b => b.id === conn.to);
      
      if (!fromBlock || !toBlock) return null;
      
      const fromX = fromBlock.position.x + 100;
      const fromY = fromBlock.position.y + 60;
      const toX = toBlock.position.x + 100;
      const toY = toBlock.position.y;
      
      return (
        <g key={`conn-${idx}`}>
          <defs>
            <marker
              id={`arrowhead-${idx}`}
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 10 3, 0 6" fill="hsl(var(--primary))" />
            </marker>
          </defs>
          <line
            x1={fromX}
            y1={fromY}
            x2={toX}
            y2={toY}
            stroke="hsl(var(--primary))"
            strokeWidth="3"
            markerEnd={`url(#arrowhead-${idx})`}
            className="cursor-pointer hover:stroke-destructive transition-colors"
            style={{ pointerEvents: 'stroke' }}
            onClick={(e) => {
              e.stopPropagation();
              if (confirm("Delete this connection?")) {
                removeConnection(conn.from, conn.to);
              }
            }}
          />
          {conn.label && (
            <text
              x={(fromX + toX) / 2}
              y={(fromY + toY) / 2}
              fill="hsl(var(--primary))"
              fontSize="12"
              textAnchor="middle"
              className="pointer-events-none bg-background px-1"
            >
              {conn.label}
            </text>
          )}
        </g>
      );
    });
  };

  return (
    <Card className="h-[calc(100vh-12rem)]">
      <CardHeader className="border-b">
        <CardTitle className="text-sm flex items-center gap-2">
          <Move className="h-4 w-4" />
          Campaign Flow (Drag blocks to arrange)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 h-full overflow-auto bg-muted/20">
        <div 
          ref={canvasRef}
          className="relative min-h-full min-w-full p-8"
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <svg
            className="absolute top-0 left-0 pointer-events-none"
            style={{ width: '100%', height: '100%', zIndex: 0 }}
          >
            {renderConnections()}
          </svg>
          
          {blocks.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <p className="text-sm">Add blocks from the left panel to start building your campaign</p>
              </div>
            </div>
          ) : (
            blocks.map((block) => {
              const blockType = blockTypes.find(bt => bt.type === block.type);
              return (
                <Card
                  key={block.id}
                  className={`absolute cursor-move transition-all ${
                    selectedBlock === block.id ? 'ring-2 ring-primary shadow-lg' : 'hover:shadow-md'
                  } ${draggingBlock === block.id ? 'opacity-70' : ''}`}
                  style={{ 
                    left: block.position.x, 
                    top: block.position.y, 
                    width: '200px',
                    zIndex: selectedBlock === block.id ? 10 : 1
                  }}
                  onMouseDown={(e) => handleMouseDown(e, block.id)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {blockType && <blockType.icon className="h-4 w-4" />}
                        <span className="text-sm font-medium">{blockType?.label}</span>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className={`h-6 w-6 p-0 ${connectingFrom === block.id ? 'bg-primary text-primary-foreground' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleBlockConnect(block.id);
                          }}
                          title={connectingFrom === block.id ? "Select target" : "Connect to another block"}
                        >
                          <GitBranch className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeBlock(block.id);
                          }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {block.type === "wait" && `${block.data.duration} ${block.data.unit}`}
                      {block.type === "send_email" && (block.data.subject || "No subject")}
                      {block.type === "send_whatsapp" && (block.data.templateName || "No template")}
                      {block.type === "conditional" && (
                        <div className="text-[10px]">
                          ✓ {block.data.truePath?.length || 0} | ✗ {block.data.falsePath?.length || 0}
                        </div>
                      )}
                      {block.type === "ab_test" && (
                        <div className="text-[10px]">
                          A: {block.data.splitPercentage}% | B: {100 - block.data.splitPercentage}%
                        </div>
                      )}
                      {block.type === "lead_condition" && (
                        <div className="text-[10px]">
                          ✓ {block.data.truePath?.length || 0} | ✗ {block.data.falsePath?.length || 0}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
