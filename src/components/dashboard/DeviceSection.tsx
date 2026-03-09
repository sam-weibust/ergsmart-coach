import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Bluetooth, Heart, Activity, Smartphone, CheckCircle2, XCircle, AlertCircle, Link, Loader2 } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { BluetoothLe, BleDevice } from "@capacitor-community/bluetooth-le";
import { supabase } from "@/integrations/supabase/client";

interface DeviceConnection {
  name: string;
  type: "erg" | "heartRate";
  connected: boolean;
  deviceId?: string;
  device?: BleDevice;
}

interface C2Connection {
  id: string;
  c2_user_id: string;
  last_sync_at: string | null;
}

const DeviceSection = () => {
  const { toast } = useToast();
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<DeviceConnection[]>([]);
  const [bluetoothEnabled, setBluetoothEnabled] = useState(false);
  const [isNative, setIsNative] = useState(false);
  const [c2Connection, setC2Connection] = useState<C2Connection | null>(null);
  const [isConnectingC2, setIsConnectingC2] = useState(false);
  const [isSyncingC2, setIsSyncingC2] = useState(false);

  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform());
    checkBluetoothStatus();
  }, []);

  const checkBluetoothStatus = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        await BluetoothLe.initialize();
        const enabled = await BluetoothLe.isEnabled();
        setBluetoothEnabled(enabled.value);
        
        if (!enabled.value) {
          toast({
            title: "Bluetooth Disabled",
            description: "Please enable Bluetooth in your device settings.",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error('Bluetooth check failed:', error);
      }
    }
  };

  const enableBluetooth = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        await BluetoothLe.enable();
        setBluetoothEnabled(true);
        toast({
          title: "Bluetooth Enabled",
          description: "You can now scan for devices.",
        });
      } catch (error) {
        toast({
          title: "Failed to Enable Bluetooth",
          description: "Please enable Bluetooth manually in settings.",
          variant: "destructive",
        });
      }
    }
  };

  const scanForDevices = async (type: "erg" | "heartRate") => {
    if (!bluetoothEnabled && isNative) {
      toast({
        title: "Bluetooth Required",
        description: "Please enable Bluetooth first.",
        variant: "destructive",
      });
      return;
    }

    setIsScanning(true);

    try {
      if (Capacitor.isNativePlatform()) {
        // Native Capacitor Bluetooth
        const services = type === "erg" 
          ? ["ce060030-43e5-11e4-916c-0800200c9a66"] // Concept2 PM5 service
          : ["0000180d-0000-1000-8000-00805f9b34fb"]; // Heart Rate service

        await BluetoothLe.requestLEScan({
          services,
          allowDuplicates: false,
          scanMode: 1, // Low power scan mode
        });

        // Listen for scan results
        BluetoothLe.addListener('onScanResult', (result) => {
          if (result.device) {
            const newDevice: DeviceConnection = {
              name: result.device.name || (type === "erg" ? "Concept2 Erg" : "Heart Rate Monitor"),
              type,
              connected: false,
              deviceId: result.device.deviceId,
              device: result.device,
            };

            setDevices(prev => {
              const exists = prev.find(d => d.deviceId === result.device.deviceId);
              if (!exists) {
                return [...prev, newDevice];
              }
              return prev;
            });
          }
        });

        // Stop scanning after 5 seconds
        setTimeout(async () => {
          await BluetoothLe.stopLEScan();
          setIsScanning(false);
        }, 5000);

      } else {
        // Fallback to Web Bluetooth for browser testing
        const nav = navigator as any;
        if (!nav.bluetooth) {
          toast({
            title: "Bluetooth Not Supported",
            description: "Your browser doesn't support Web Bluetooth. Install the mobile app for full Bluetooth support.",
            variant: "destructive",
          });
          return;
        }

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
            connected: false,
            deviceId: device.id,
          };

          setDevices(prev => {
            const filtered = prev.filter(d => d.deviceId !== device.id);
            return [...filtered, newDevice];
          });
        }
        setIsScanning(false);
      }
    } catch (error: any) {
      setIsScanning(false);
      if (error.name !== "NotFoundError") {
        toast({
          title: "Scan Failed",
          description: error.message || "Could not scan for devices",
          variant: "destructive",
        });
      }
    }
  };

  const connectToDevice = async (device: DeviceConnection) => {
    if (!device.deviceId) return;

    try {
      if (Capacitor.isNativePlatform() && device.device) {
        await BluetoothLe.connect({ deviceId: device.deviceId });
        
        setDevices(prev => 
          prev.map(d => 
            d.deviceId === device.deviceId 
              ? { ...d, connected: true }
              : d.type === device.type 
                ? { ...d, connected: false } // Disconnect other devices of same type
                : d
          )
        );

        toast({
          title: "Device Connected",
          description: `Successfully connected to ${device.name}`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Connection Failed",
        description: error.message || "Could not connect to device",
        variant: "destructive",
      });
    }
  };

  const disconnectDevice = async (device: DeviceConnection) => {
    if (!device.deviceId) return;

    try {
      if (Capacitor.isNativePlatform()) {
        await BluetoothLe.disconnect({ deviceId: device.deviceId });
      }
      
      setDevices(prev => 
        prev.map(d => 
          d.deviceId === device.deviceId 
            ? { ...d, connected: false }
            : d
        )
      );

      toast({
        title: "Device Disconnected",
        description: `${device.name} disconnected`,
      });
    } catch (error: any) {
      toast({
        title: "Disconnection Failed",
        description: error.message || "Could not disconnect from device",
        variant: "destructive",
      });
    }
  };

  const connectedErg = devices.find(d => d.type === "erg" && d.connected);
  const connectedHR = devices.find(d => d.type === "heartRate" && d.connected);
  const availableErgs = devices.filter(d => d.type === "erg" && !d.connected);
  const availableHRs = devices.filter(d => d.type === "heartRate" && !d.connected);

  return (
    <div className="space-y-6">
      {/* Bluetooth Status */}
      {isNative && (
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <Bluetooth className={`h-5 w-5 ${bluetoothEnabled ? 'text-green-500' : 'text-muted-foreground'}`} />
              <span className="font-medium">
                Bluetooth {bluetoothEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            {!bluetoothEnabled && (
              <Button onClick={enableBluetooth} size="sm">
                Enable Bluetooth
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {!isNative && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <div className="text-sm">
              <p className="font-medium text-amber-800 dark:text-amber-200">Limited Bluetooth Support</p>
              <p className="text-amber-700 dark:text-amber-300">For full Bluetooth functionality, install the mobile app from the App Store or Google Play.</p>
            </div>
          </CardContent>
        </Card>
      )}

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
                    {connectedErg ? connectedErg.name : "Not connected"}
                  </p>
                </div>
              </div>
              {connectedErg ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            
            {connectedErg ? (
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => disconnectDevice(connectedErg)}
              >
                Disconnect Erg
              </Button>
            ) : (
              <div className="space-y-2">
                <Button 
                  className="w-full"
                  onClick={() => scanForDevices("erg")}
                  disabled={isScanning || (!bluetoothEnabled && isNative)}
                >
                  {isScanning ? "Scanning..." : "Scan for Concept2 Erg"}
                </Button>
                
                {availableErgs.map((device) => (
                  <Button
                    key={device.deviceId}
                    variant="outline"
                    className="w-full"
                    onClick={() => connectToDevice(device)}
                  >
                    Connect to {device.name}
                  </Button>
                ))}
              </div>
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
                    {connectedHR ? connectedHR.name : "Not connected"}
                  </p>
                </div>
              </div>
              {connectedHR ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            
            {connectedHR ? (
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => disconnectDevice(connectedHR)}
              >
                Disconnect Heart Rate Monitor
              </Button>
            ) : (
              <div className="space-y-2">
                <Button 
                  className="w-full"
                  onClick={() => scanForDevices("heartRate")}
                  disabled={isScanning || (!bluetoothEnabled && isNative)}
                >
                  {isScanning ? "Scanning..." : "Scan for Heart Rate Monitor"}
                </Button>
                
                {availableHRs.map((device) => (
                  <Button
                    key={device.deviceId}
                    variant="outline"
                    className="w-full"
                    onClick={() => connectToDevice(device)}
                  >
                    Connect to {device.name}
                  </Button>
                ))}
              </div>
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