if (toolName === 'get_staff_work_info') {
    const { employeeName, targetDate } = parameters;

    // Paso 1: Obtener el ID del empleado desde la tabla profiles
    const { data: profile, error: pError } = await supabase
        .from('profiles')
        .select('id')
        .eq('first_name', employeeName)
        .single();

    if (pError || !profile) {
        return NextResponse.json({ deuda_total: 0, status: `No se encontró a ${employeeName}` });
    }

    // Paso 2: Obtener el balance más reciente usando el ID encontrado
    const { data: snapshot, error: sError } = await supabase
        .from('weekly_snapshots')
        .select('final_balance')
        .eq('user_id', profile.id) // Usamos el ID de la tabla profiles
        .lte('week_start', targetDate)
        .order('week_start', { ascending: false })
        .limit(1);

    if (sError) return NextResponse.json({ error: sError.message }, { status: 500 });

    const balance = snapshot?.[0]?.final_balance ?? 0;

    return NextResponse.json({
        deuda_total: balance,
        status: `Saldo de ${employeeName} recuperado correctamente.`
    });
}