import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Bluetooth, Heart, Activity, Smartphone, CheckCircle2, XCircle } from "lucide-react";

interface DeviceConnection {
  name: string;
  type: "erg" | "heartRate";
  connected: boolean;
}

const DeviceSection = () => {
  const { toast } = useToast();
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<DeviceConnection[]>([]);

  const scanForDevices = async (type: "erg" | "heartRate") => {
    const nav = navigator as any;
    if (!nav.bluetooth) {
      toast({
        title: "Bluetooth Not Supported",
        description: "Your browser doesn't support Web Bluetooth. Try Chrome or Edge.",
        variant: "destructive",
      });
      return;
    }

    setIsScanning(true);

    try {
      const serviceUUID = type === "erg" 
        ? "ce060030-43e5-11e4-916c-0800200c9a66" // Concept2 PM5 service
        : "0000180d-0000-1000-8000-00805f9b34fb"; // Heart Rate service

      const device = await nav.bluetooth.requestDevice({
        filters: type === "erg" 
          ? [{ services: [serviceUUID] }, { namePrefix: "PM5" }]
          : [{ services: ["heart_rate"] }],
        optionalServices: type === "erg" 
          ? ["ce060030-43e5-11e4-916c-0800200c9a66"]
          : ["heart_rate"],
      });

      if (device) {
        const newDevice: DeviceConnection = {
          name: device.name || (type === "erg" ? "Concept2 Erg" : "Heart Rate Monitor"),
          type,
          connected: true,
        };

        setDevices(prev => {
          const filtered = prev.filter(d => d.type !== type);
          return [...filtered, newDevice];
        });

        toast({
          title: "Device Connected",
          description: `Successfully connected to ${newDevice.name}`,
        });
      }
    } catch (error: any) {
      if (error.name !== "NotFoundError") {
        toast({
          title: "Connection Failed",
          description: error.message || "Could not connect to device",
          variant: "destructive",
        });
      }
    } finally {
      setIsScanning(false);
    }
  };

  const disconnectDevice = (type: "erg" | "heartRate") => {
    setDevices(prev => prev.filter(d => d.type !== type));
    toast({
      title: "Device Disconnected",
      description: `${type === "erg" ? "Erg" : "Heart rate monitor"} disconnected`,
    });
  };

  const ergDevice = devices.find(d => d.type === "erg");
  const hrDevice = devices.find(d => d.type === "heartRate");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bluetooth className="h-5 w-5" />
            Device Connections
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Connect your Concept2 erg or heart rate monitor via Bluetooth to track your workouts.
          </p>

          {/* Concept2 Erg Connection */}
          <div className="p-4 border rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Activity className="h-8 w-8 text-primary" />
                <div>
                  <h3 className="font-semibold">Concept2 Erg (PM5)</h3>
                  <p className="text-sm text-muted-foreground">
                    {ergDevice ? ergDevice.name : "Not connected"}
                  </p>
                </div>
              </div>
              {ergDevice?.connected ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            {ergDevice?.connected ? (
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => disconnectDevice("erg")}
              >
                Disconnect Erg
              </Button>
            ) : (
              <Button 
                className="w-full"
                onClick={() => scanForDevices("erg")}
                disabled={isScanning}
              >
                {isScanning ? "Scanning..." : "Connect Concept2 Erg"}
              </Button>
            )}
          </div>

          {/* Heart Rate Monitor Connection */}
          <div className="p-4 border rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Heart className="h-8 w-8 text-red-500" />
                <div>
                  <h3 className="font-semibold">Heart Rate Monitor</h3>
                  <p className="text-sm text-muted-foreground">
                    {hrDevice ? hrDevice.name : "Not connected"}
                  </p>
                </div>
              </div>
              {hrDevice?.connected ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            {hrDevice?.connected ? (
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => disconnectDevice("heartRate")}
              >
                Disconnect Heart Rate Monitor
              </Button>
            ) : (
              <Button 
                className="w-full"
                onClick={() => scanForDevices("heartRate")}
                disabled={isScanning}
              >
                {isScanning ? "Scanning..." : "Connect Heart Rate Monitor"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            ErgData App Connection
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Alternatively, use the Concept2 ErgData app to sync your workouts. Log workouts in ErgData, then manually enter the results here.
          </p>
          <div className="p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium mb-2">How to sync with ErgData:</h4>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Open the ErgData app on your phone</li>
              <li>Connect to your PM5 via Bluetooth</li>
              <li>Complete your workout</li>
              <li>Enter your results in the Erg Workouts section</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DeviceSection;
