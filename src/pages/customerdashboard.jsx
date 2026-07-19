import { useEffect, useState, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, Button, Badge, Table, TableRow, TableBody, TableCell, Modal, Label } from "../components/ui";
import { useLocation, useNavigate } from "react-router-dom";
import { Award, ArrowLeft, Building2, History, RefreshCw, Zap, Droplets, Utensils, Shirt, Clock, User, Mail, Phone, Download, BedDouble } from "lucide-react";
import { toast } from "sonner";

/**
 * Helper: Formats ISO date strings to Indian Standard Time (IST)
 */
const formatToIST = (isoString) => {
    if (!isoString) return 'N/A';
    try {
        const date = new Date(isoString);
        return date.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    } catch (e) {
        return isoString;
    }
};

/**
 * Customer Dashboard Component
 * Displays the guest's current stay details, consumption stats, and historical visits.
 */
export default function CustomerDashboard() {
  const navigate = useNavigate();
  const { state } = useLocation();
  
  // State Initialization: Lazily loads from localStorage or navigation state
  const [guestData, setGuestData] = useState(() => {
      const stored = localStorage.getItem("guest_data");
      return state?.guestData || (stored ? JSON.parse(stored) : null);
  });

  const [stats, setStats] = useState(() => {
      const stored = localStorage.getItem("guest_stats");
      return state?.stats || (stored ? JSON.parse(stored) : { total_visits: 0, total_co2: 0, last_visit_co2: 0, history: [] });
  });

  const [loading, setLoading] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState(null);

  // Persistence Effect: Saves data to localStorage whenever it changes
  useEffect(() => {
      if (guestData) {
          localStorage.setItem("guest_data", JSON.stringify(guestData));
      }
      if (stats) {
          localStorage.setItem("guest_stats", JSON.stringify(stats));
      }
  }, [guestData, stats]);

  /**
   * Refreshes the dashboard data from the API
   */
  const fetchFreshData = useCallback(async (bookingId) => {
    if (!bookingId) {
        navigate("/login/customer");
        return;
    }
    
    setLoading(true);
    try {
        const res = await fetch(`/api/guest-portal/${bookingId}`);
        if (res.ok) {
            const data = await res.json();
            setGuestData(data.guest_data);
            setStats(data.stats);
            toast.success(`Dashboard updated for ${data.guest_data.hotelName}`);
        } else {
             toast.error("Failed to refresh data for current trip.");
        }
    } catch (error) {
        console.error("Refresh failed", error);
    } finally {
        setLoading(false);
    }
  }, [navigate]);

  // Auth Check: Redirect to login if no guest data is present
  useEffect(() => {
    if (!guestData) {
      navigate("/login/customer");
      return;
    } 
  }, [guestData, navigate]);

  /**
   * Opens the history modal for a specific past stay
   */
  const handleHistoryClick = (stay) => {
      setSelectedHistory(stay);
      setIsHistoryModalOpen(true);
  };

  /**
   * Trigger CSV download of the guest's data
   */
  const handleDownloadGuestData = async () => {
    if (!guestData || !guestData.email) {
        toast.error("User email is missing; cannot download data.");
        return;
    }

    try {
        const response = await fetch('/api/download/guest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: guestData.email })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || "Failed to download data.");
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        // Extract filename from headers or generate default
        const contentDisposition = response.headers.get('content-disposition');
        let filename = `${guestData.name.replace(/\s/g, '_')}_history.csv`;

        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="?([^"]*)"?/i);
            if (filenameMatch && filenameMatch[1]) {
                filename = filenameMatch[1];
            }
        }

        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        toast.success("Stay history downloaded successfully!");
        
    } catch (error) {
        console.error("Download failed:", error);
        toast.error(error.message || "Could not download personal data.");
    }
  };

  /**
   * Clears session and redirects to home
   */
  const handleLogout = () => {
      localStorage.removeItem("guest_data");
      localStorage.removeItem("guest_stats");
      navigate("/");
  };

  if (!guestData) return null;

  return (
    <div className="min-h-screen bg-slate-50 p-4 flex justify-center">
      <div className="max-w-4xl w-full space-y-6">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-sm text-primary font-semibold flex items-center gap-1">
                <Building2 className="w-4 h-4"/> 
                {guestData.is_active 
                    ? `Current Stay at: ${guestData.hotelName || "GreenStay Hotel"}` 
                    : `Most Recent Stay: ${guestData.hotelName || "GreenStay Hotel"}`}
            </p>
            <h1 className="text-2xl font-bold text-slate-900">Welcome back, {guestData.name}</h1>
            <p className="text-sm text-slate-500">
                Current Trip ID: <span className="font-mono text-slate-700">{guestData.bookingId}</span>
            </p>
          </div>
          <div className="flex gap-2">
             <Button variant="outline" onClick={() => fetchFreshData(guestData.bookingId)} disabled={loading} className="gap-2">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                {loading ? "Updating..." : "Refresh Data"}
             </Button>
             
             <Button variant="secondary" onClick={handleDownloadGuestData} disabled={!guestData.email} className="h-10 gap-2">
                <Download className="w-4 h-4"/> Download My Data
             </Button>

             <Button variant="ghost" onClick={handleLogout}><ArrowLeft className="w-4 h-4 mr-2"/> Logout</Button>
          </div>
        </div>

        {/* User Profile Card */}
        <Card className="p-4 border-slate-200">
            <div className="grid sm:grid-cols-4 gap-4">
                <div className="flex items-center space-x-3">
                    <User className="w-5 h-5 text-primary"/>
                    <div>
                        <Label className="text-xs uppercase text-slate-500">Full Name</Label>
                        <p className="font-medium text-slate-800">{guestData.name}</p>
                    </div>
                </div>
                <div className="flex items-center space-x-3">
                    <Mail className="w-5 h-5 text-primary"/>
                    <div>
                        <Label className="text-xs uppercase text-slate-500">Email Address</Label>
                        <p className="font-medium text-slate-800">{guestData.email}</p>
                    </div>
                </div>
                <div className="flex items-center space-x-3">
                    <Phone className="w-5 h-5 text-primary"/>
                    <div>
                        <Label className="text-xs uppercase text-slate-500">Phone Number</Label>
                        <p className="font-medium text-slate-800">{guestData.phone || 'N/A'}</p>
                    </div>
                </div>
                <div className="flex items-center space-x-3">
                    <BedDouble className="w-5 h-5 text-primary"/>
                    <div>
                        <Label className="text-xs uppercase text-slate-500">Room</Label>
                        <p className="font-medium text-slate-800">{guestData.room || 'N/A'}</p>
                    </div>
                </div>
            </div>
        </Card>

        {/* Global Statistics */}
        <div className="grid grid-cols-3 gap-4">
            <Card className="bg-emerald-600 text-white border-none shadow-lg shadow-emerald-200">
                <CardContent className="p-6">
                    <p className="text-emerald-100 text-sm font-medium mb-1">Total Visits</p>
                    <p className="text-4xl font-bold">{stats.total_visits}</p>
                </CardContent>
            </Card>
            <Card className="bg-teal-600 text-white border-none shadow-lg shadow-teal-200">
                <CardContent className="p-6">
                    <p className="text-teal-100 text-sm font-medium mb-1">Lifetime CO₂ Saved</p>
                    <p className="text-4xl font-bold">{Math.round(stats.total_co2)} <span className="text-lg font-normal opacity-80">kg</span></p>
                </CardContent>
            </Card>
            <Card className="bg-white border border-slate-200 shadow-sm">
                <CardContent className="p-6">
                    <p className="text-slate-500 text-sm font-medium mb-1">Last Visit Impact</p>
                    <p className="text-4xl font-bold text-slate-800">{Math.round(stats.last_visit_co2)} <span className="text-lg font-normal opacity-40">kg</span></p>
                </CardContent>
            </Card>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          
          {/* Active Stay Details Card */}
          <Card className="md:col-span-2 shadow-lg border-t-4 border-t-primary h-fit">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                    <CardTitle>Current Trip Status</CardTitle>
                    <CardDescription>Real-time impact of your active stay</CardDescription>
                </div>
                <Badge variant={guestData.is_active ? 'warning' : 'default'} className="text-sm px-3 py-1">
                  {guestData.is_active ? 'Active Stay' : 'Checked Out'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="flex items-center justify-center py-8 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="text-center">
                    <span className="block text-sm font-semibold text-slate-500 mb-2 uppercase tracking-wider">Current Carbon Footprint</span>
                    <span className="text-6xl font-bold text-primary">
                        {guestData.co2 || "0.00"} <span className="text-xl font-normal text-slate-400">kg</span>
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="p-4 border rounded-xl bg-white">
                        <span className="block text-slate-500 mb-1 text-xs uppercase">Electricity</span>
                        <span className="font-bold text-lg">{guestData.electricity || 0} <span className="text-xs font-normal text-slate-400">kWh</span></span>
                    </div>
                    <div className="p-4 border rounded-xl bg-white">
                        <span className="block text-slate-500 mb-1 text-xs uppercase">Water</span>
                        <span className="font-bold text-lg">{guestData.water || 0} <span className="text-xs font-normal text-slate-400">L</span></span>
                    </div>
                    <div className="p-4 border rounded-xl bg-white">
                        <span className="block text-slate-500 mb-1 text-xs uppercase">Laundry</span>
                        <span className="font-bold text-lg">{guestData.laundry || 0} <span className="text-xs font-normal text-slate-400">kg</span></span>
                    </div>
                    <div className="p-4 border rounded-xl bg-white">
                        <span className="block text-slate-500 mb-1 text-xs uppercase">Meals</span>
                        <span className="font-bold text-lg">{guestData.meals || 0} <span className="text-xs font-normal text-slate-400">Count</span></span>
                    </div>
                </div>
                
                {Number(guestData.discount) > 0 ? (
                  <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 flex items-center gap-4 animate-pulse-slow">
                    <div className="p-3 bg-white rounded-full shadow-sm">
                        <Award className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div>
                        <p className="font-bold text-emerald-900 text-lg">You've earned a {guestData.discount}% Discount!</p>
                        {guestData.is_active && (
                            <p className="text-sm text-emerald-700">Show this screen to the reception to redeem.</p>
                        )}
                    </div>
                  </div>
                ) : (
                   <p className="text-xs text-center text-slate-400 italic">Reduce consumption to earn eco-rewards.</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Stay History Table */}
          <Card className="md:col-span-1 h-full flex flex-col">
            <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2"><History className="w-5 h-5 text-slate-400"/> Stay History</CardTitle>
            </CardHeader>
            <CardContent className="px-0 flex-1">
                <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                    <Table>
                        <TableBody>
                            {stats.history.map((stay, i) => (
                                <TableRow 
                                    key={i} 
                                    onClick={() => handleHistoryClick(stay)}
                                    className="hover:bg-slate-50 cursor-pointer"
                                >
                                    <TableCell className="py-4 pl-6">
                                        <p className="font-medium text-slate-700">{stay.hotelName || "Stay"}</p>
                                        <p className="text-xs text-slate-400">{stay.checkInDate || stay.date ? (stay.checkInDate || stay.date).split('T')[0] : 'N/A'}</p>
                                    </TableCell>
                                    <TableCell className="text-right pr-6 font-bold text-primary">{Number(stay.co2).toFixed(1)} kg</TableCell>
                                </TableRow>
                            ))}
                            {stats.history.length === 0 && (
                                <TableRow><TableCell colSpan={2} className="text-center py-8 text-slate-400 italic">No past stays found.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
          </Card>

        </div>
      </div>
      
      {/* Historical Detail Modal */}
      {selectedHistory && (
          <Modal 
              isOpen={isHistoryModalOpen} 
              onClose={() => setIsHistoryModalOpen(false)} 
              title={`Details: ${selectedHistory.hotelName || 'Stay'}`}
          >
              <div className="space-y-4">
                  <div className="flex justify-between items-center pb-2 border-b">
                      <div className="space-y-0.5">
                          <h4 className="text-lg font-bold text-slate-800">Trip at {selectedHistory.hotelName || 'Unknown Hotel'}</h4>
                          <p className="text-sm text-slate-500 flex items-center gap-1">
                            <Clock className="w-4 h-4"/> Status: 
                            <Badge variant={selectedHistory.status === 'checked-in' ? 'warning' : 'default'} className="ml-1">
                                {selectedHistory.status === 'checked-in' ? 'Active Stay' : 'Checked Out'}
                            </Badge>
                          </p>
                      </div>
                      <p className="text-2xl font-extrabold text-primary">{Number(selectedHistory.co2).toFixed(2)} kg CO₂</p>
                  </div>
                  
                  <div className="pt-2">
                      <Label className="text-xs uppercase font-medium">Hotel Booking Details</Label>
                      <p className="font-bold text-lg text-slate-800 mb-1">{selectedHistory.hotelName || 'N/A'}</p>
                      <p className="text-sm text-slate-500">Booking ID: {selectedHistory.bookingId}</p>
                      <p className="text-sm text-slate-500">Room: {selectedHistory.room || 'N/A'}</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                          <Label className="text-xs uppercase font-medium">Check-in Time (IST)</Label>
                          <p className="font-semibold text-slate-700">{formatToIST(selectedHistory.timestamp || selectedHistory.date || selectedHistory.checkInDate)}</p>
                      </div>
                      <div>
                          <Label className="text-xs uppercase font-medium">Check-out Time (IST)</Label>
                          <p className={`font-semibold ${selectedHistory.actualCheckOutDate ? 'text-slate-700' : 'text-slate-400 italic'}`}>
                              {selectedHistory.actualCheckOutDate ? formatToIST(selectedHistory.actualCheckOutDate) : 'N/A (Still Active)'}
                          </p>
                      </div>
                  </div>
                  
                  <h4 className="font-bold text-md pt-2 text-slate-700">Resource Consumption</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="p-3 border rounded-lg bg-white/70">
                          <span className="block text-slate-500 mb-1 text-xs uppercase"><Zap className="inline w-3 h-3 mr-1"/> Electricity</span>
                          <span className="font-bold text-lg">{selectedHistory.electricity || 0} kWh</span>
                      </div>
                      <div className="p-3 border rounded-lg bg-white/70">
                          <span className="block text-slate-500 mb-1 text-xs uppercase"><Droplets className="inline w-3 h-3 mr-1"/> Water</span>
                          <span className="font-bold text-lg">{selectedHistory.water || 0} L</span>
                      </div>
                      <div className="p-3 border rounded-lg bg-white/70">
                          <span className="block text-slate-500 mb-1 text-xs uppercase"><Shirt className="inline w-3 h-3 mr-1"/> Laundry</span>
                          <span className="font-bold text-lg">{selectedHistory.laundry || 0} kg</span>
                      </div>
                      <div className="p-3 border rounded-lg bg-white/70">
                          <span className="block text-slate-500 mb-1 text-xs uppercase"><Utensils className="inline w-3 h-3 mr-1"/> Meals</span>
                          <span className="font-bold text-lg">{selectedHistory.meals || 0} Count</span>
                      </div>
                  </div>
              </div>
          </Modal>
      )}
    </div>
  );
}