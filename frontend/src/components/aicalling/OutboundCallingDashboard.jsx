// we will use accessibleClientIds if neccessary, else remove it and also not pass it from Services.jsx page
export default function OutboundCallingDashboard({ accessibleClientIds = null }) {
  return (
    <div className="space-y-8 h-[calc(100vh-264px)] flex justify-center items-center">
      <p className="font-semibold text-lg">Outbound Calling To Be Introduced Soon</p>
    </div>
  )
}
